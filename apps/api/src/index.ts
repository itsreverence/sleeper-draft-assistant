import { serve } from "@hono/node-server";
import {
  advanceMockDraftState,
  buildDraftOptionForPlayer,
  buildDraftRecommendation,
  buildTeamDataReadiness,
  buildTeamLineupSummary,
  buildTeamNeedsSummary,
  buildTeamWaiverSummary,
  createMockDraftState,
  isDraftChoiceRosterFeasible,
  type DraftRecommendationOptions,
} from "@sleeper-draft-assistant/engine";
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";

import { AdpImportRequestSchema, DraftStrategyInstructionSourceSchema, DraftStrategyProposalSchema, RankingImportRequestSchema, RosRankingImportRequestSchema, SeasonProjectionImportRequestSchema, WeeklyProjectionBatchImportRequestSchema, WeeklyProjectionImportRequestSchema, type AdpImportSummary, type AppSettings, type DraftRecommendation, type DraftState, type RankingImportSummary, type Player, type RosRankingImportSummary, type SeasonProjectionImportSummary, type TeamActivitySummary, type TeamDataReadiness, type TeamLineupSummary, type TeamManagerState, type TeamNeedsSummary, type TeamWaiverSummary, type TeamWeekContext, type WeeklyProjectionImportSummary } from "@sleeper-draft-assistant/shared";

import { buildDraftQuestionContext, buildDraftStrategyContext } from "./ai/context";
import { createDraftPlayerSnapshot, createDraftStrategyTools } from "./ai/draft-tools";
import { buildTeamAiContext } from "./ai/team-context";
import { DecisionLogStore, type DecisionSnapshotTrigger } from "./decision-log-store";
import { DraftPlanStore } from "./draft-plan-store";
import { DraftStrategyInstructionStore } from "./draft-strategy-instruction-store";
import { draftPollDelayMs } from "./draft-refresh";
import { createEventStreamChannel } from "./event-stream";
import { AiProviderManager } from "./ai/provider-factory";
import { applyImportedPlayerValues, importFantasyProsCsv, isDraftRankingImportCompatible, RankingImportStore } from "./rankings-import";
import { AdpImportStore, SeasonProjectionImportStore, applyAdpValue, applySeasonProjectionValue, importFantasyProsAdpCsv, importFantasyProsSeasonProjectionCsvs } from "./draft-value-import";
import { RosRankingImportStore, applyRosRankingsToPlayers, applyRosRankingsToTeamState, importFantasyProsRosRankings, isRosRankingImportActive, isRosScoringCompatible, normalizeScoringFormat } from "./ros-rankings-import";
import { WeeklyProjectionImportStore, applyWeeklyProjectionsToPlayers, applyWeeklyProjectionsToTeamState, importFantasyProsWeeklyProjectionCsv, isWeeklyProjectionImportActive, mergeWeeklyProjectionImports } from "./weekly-projections-import";
import { getSleeperConnectOptions } from "./sleeper-connect";
import { SleeperApiError, SleeperClient } from "./sleeper";
import { SettingsStore } from "./settings-store";
import { SqliteAppDatabase } from "./sqlite-app-database";
import { requireApiToken } from "./api-auth";
import { parseApiPort } from "./config";
import { buildRedactedSupportReport, buildStorageInventory } from "./data-management";

export const app = new Hono();
const port = parseApiPort(process.env.PORT);
const hostname = "127.0.0.1";
const apiToken = process.env.SLEEPER_AI_API_TOKEN?.trim() || null;
const sleeperClient = new SleeperClient();
const appDatabase = await SqliteAppDatabase.open();
const rankingImportStore = new RankingImportStore(undefined, appDatabase);
const seasonProjectionImportStore = new SeasonProjectionImportStore(undefined, appDatabase);
const adpImportStore = new AdpImportStore(undefined, appDatabase);
const rosRankingImportStore = new RosRankingImportStore(undefined, appDatabase);
const weeklyProjectionImportStore = new WeeklyProjectionImportStore(undefined, appDatabase);
const decisionLogStore = new DecisionLogStore(undefined, 200, appDatabase);
const draftPlanStore = new DraftPlanStore(appDatabase);
const draftStrategyInstructionStore = new DraftStrategyInstructionStore(appDatabase);
const settingsStore = new SettingsStore(undefined, appDatabase);
const aiProviderManager = new AiProviderManager();
let mockState = createMockDraftState(8);

type DraftPayload = {
  state: DraftState;
  recommendation: DraftRecommendation;
  rankingImportSummary: RankingImportSummary | null;
  seasonProjectionImportSummary: SeasonProjectionImportSummary | null;
  adpImportSummary: AdpImportSummary | null;
};

type DraftPayloadOptions = {
  recommendation?: DraftRecommendation;
  recordTrigger?: DecisionSnapshotTrigger;
  userRosterId?: string | null;
};

type TeamPayload = {
  state: TeamManagerState;
  dataReadiness: TeamDataReadiness;
  needs: TeamNeedsSummary;
  lineupSummary: TeamLineupSummary;
  weekContext: TeamWeekContext | null;
  waiverSummary: TeamWaiverSummary;
  activitySummary: TeamActivitySummary;
  rosRankingSummary: RosRankingImportSummary | null;
  weeklyProjectionSummary: WeeklyProjectionImportSummary | null;
};

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);

app.use(
  "*",
  requireApiToken(apiToken, { allowUnauthenticated: process.env.NODE_ENV === "test" }),
);

app.get("/health", (c) => c.json(createHealthPayload()));

app.get("/diagnostics", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(createDiagnosticsPayload());
});

app.get("/data", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(buildStorageInventory(appDatabase));
});

app.get("/data/support-report", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(
    buildRedactedSupportReport({
      diagnostics: createDiagnosticsPayload(),
      database: appDatabase,
      settings: settingsStore.get(),
    }),
  );
});

app.delete("/data/:category", async (c) => {
  try {
    const category = c.req.param("category");
    let deleted = 0;
    if (category === "rankings") {
      deleted = rankingImportStore.clearAll();
    } else if (category === "season-projections") {
      deleted = seasonProjectionImportStore.clearAll();
    } else if (category === "adp") {
      deleted = adpImportStore.clearAll();
    } else if (category === "ros-rankings") {
      deleted = rosRankingImportStore.clearAll();
    } else if (category === "weekly-projections") {
      deleted = weeklyProjectionImportStore.clearAll();
    } else if (category === "decision-history") {
      deleted = decisionLogStore.clearAll();
    } else if (category === "draft-plans") {
      deleted = draftPlanStore.clearAll();
    } else if (category === "strategy-instructions") {
      deleted = draftStrategyInstructionStore.clearAll();
    } else {
      return c.json({ error: "Unknown local data category." }, 404);
    }
    return c.json({ deleted, inventory: buildStorageInventory(appDatabase) });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/data/reset", async (c) => {
  try {
    const body = await c.req.json<{ confirmation?: string }>().catch(() => ({ confirmation: "" }));
    if (body.confirmation !== "DELETE ALL LOCAL DATA") {
      return c.json({ error: "Local data reset was not confirmed." }, 400);
    }

    rankingImportStore.clearAll();
    seasonProjectionImportStore.clearAll();
    adpImportStore.clearAll();
    rosRankingImportStore.clearAll();
    weeklyProjectionImportStore.clearAll();
    decisionLogStore.clearAll();
    draftPlanStore.clearAll();
    draftStrategyInstructionStore.clearAll();
    const settings = settingsStore.reset();
    return c.json({ settings, inventory: buildStorageInventory(appDatabase) });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/settings", (c) => c.json(settingsStore.get()));

app.put("/settings", async (c) => {
  try {
    const input = await c.req.json<Record<string, unknown>>();
    return c.json(settingsStore.update(input));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/ai/status", (c) => c.json(aiProviderManager.get(settingsStore.get()).status()));

app.get("/drafts/:draftId/strategy-instructions", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    return c.json({
      instructions: draftStrategyInstructionStore.list(draftId, state.userTeamId, state.currentPick),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/strategy-instructions", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const body = await c.req.json<Record<string, unknown>>();
    const proposal = DraftStrategyProposalSchema.parse(body);
    const source = DraftStrategyInstructionSourceSchema.parse(body.source ?? "manual");
    return c.json({
      instructions: draftStrategyInstructionStore.create(
        draftId,
        state.userTeamId,
        state.currentPick,
        proposal,
        source,
      ),
    }, 201);
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.put("/drafts/:draftId/strategy-instructions/:instructionId", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const proposal = DraftStrategyProposalSchema.parse(await c.req.json<Record<string, unknown>>());
    const instructions = draftStrategyInstructionStore.update(
      draftId,
      state.userTeamId,
      state.currentPick,
      c.req.param("instructionId"),
      proposal,
    );
    return instructions ? c.json({ instructions }) : c.json({ error: "Strategy instruction not found." }, 404);
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.delete("/drafts/:draftId/strategy-instructions/:instructionId", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const instructions = draftStrategyInstructionStore.delete(
      draftId,
      state.userTeamId,
      state.currentPick,
      c.req.param("instructionId"),
    );
    return instructions ? c.json({ instructions }) : c.json({ error: "Strategy instruction not found." }, 404);
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/drafts/mock/state", (c) => {
  return c.json(toDraftPayload(applyDraftData("mock-draft", mockState), "mock-draft"));
});

app.get("/sleeper/connect", async (c) => {
  const username = c.req.query("username")?.trim();
  const season = c.req.query("season")?.trim() || null;
  const leagueId = c.req.query("leagueId")?.trim() || null;

  if (!username) {
    return c.json({ error: "Sleeper username or user ID is required." }, 400);
  }

  try {
    return c.json(await getSleeperConnectOptions(sleeperClient, username, season, leagueId));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/leagues/:leagueId/team", async (c) => {
  try {
    const leagueId = c.req.param("leagueId");
    const userRosterId = getUserRosterId(c);
    const [state, weekContext, availablePlayers, activitySummary] = await Promise.all([
      sleeperClient.getTeamManagerState(leagueId, userRosterId),
      sleeperClient.getTeamWeekContext(leagueId, getWeek(c), userRosterId).catch(() => null),
      sleeperClient.getAvailablePlayers(leagueId).catch(() => []),
      sleeperClient.getTeamActivitySummary(leagueId, getWeek(c)).catch(() => null),
    ]);
    const selectedWeek = getWeek(c) ?? state.week ?? 1;
    const weeklyImport = getWeeklyProjectionImport(c, leagueId, state.league.season, selectedWeek);
    const activeWeeklyImport = isWeeklyProjectionImportActive(state, weeklyImport, selectedWeek) ? weeklyImport : null;
    const rosImport = getRosRankingImport(c, leagueId, state.league.season, state.league.scoring);
    const activeRosImport = isRosRankingImportActive(state, rosImport) ? rosImport : null;
    const rankedState = applyRosRankingsToTeamState(state, activeRosImport);
    const projectedState = applyWeeklyProjectionsToTeamState(rankedState, activeWeeklyImport);
    const availableWithRanks = applyTeamRankingImport(c, availablePlayers);
    const availableWithRos = applyRosRankingsToPlayers(availableWithRanks, activeRosImport);
    const projectedAvailablePlayers = applyWeeklyProjectionsToPlayers(availableWithRos, activeWeeklyImport);
    return c.json(toTeamPayload(
      projectedState,
      weekContext,
      projectedAvailablePlayers,
      activitySummary,
      weeklyImport?.summary ?? null,
      rosImport?.summary ?? null,
    ));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/leagues/:leagueId/team/ask", async (c) => {
  try {
    const body = await c.req
      .json<{ question?: string; conversationHistory?: Array<{ role?: string; content?: string }> }>()
      .catch(() => ({ question: "", conversationHistory: [] }));
    const question = body.question?.trim() ?? "";
    if (!question) {
      return c.json({ error: "Ask a team question before requesting AI advice." }, 400);
    }

    const leagueId = c.req.param("leagueId");
    const userRosterId = getUserRosterId(c);
    const [state, weekContext, availablePlayers, activitySummary] = await Promise.all([
      sleeperClient.getTeamManagerState(leagueId, userRosterId),
      sleeperClient.getTeamWeekContext(leagueId, getWeek(c), userRosterId).catch(() => null),
      sleeperClient.getAvailablePlayers(leagueId).catch(() => []),
      sleeperClient.getTeamActivitySummary(leagueId, getWeek(c)).catch(() => null),
    ]);
    const selectedWeek = getWeek(c) ?? state.week ?? 1;
    const weeklyImport = getWeeklyProjectionImport(c, leagueId, state.league.season, selectedWeek);
    const activeWeeklyImport = isWeeklyProjectionImportActive(state, weeklyImport, selectedWeek) ? weeklyImport : null;
    const rosImport = getRosRankingImport(c, leagueId, state.league.season, state.league.scoring);
    const activeRosImport = isRosRankingImportActive(state, rosImport) ? rosImport : null;
    const rankedState = applyRosRankingsToTeamState(state, activeRosImport);
    const projectedState = applyWeeklyProjectionsToTeamState(rankedState, activeWeeklyImport);
    const rankedAvailablePlayers = applyTeamRankingImport(c, availablePlayers);
    const availableWithRos = applyRosRankingsToPlayers(rankedAvailablePlayers, activeRosImport);
    const projectedAvailablePlayers = applyWeeklyProjectionsToPlayers(availableWithRos, activeWeeklyImport);
    const aiProvider = aiProviderManager.get(settingsStore.get());
    const waiverSummary = buildTeamWaiverSummary(projectedState, projectedAvailablePlayers);
    const lineupSummary = buildTeamLineupSummary(projectedState);
    const dataReadiness = buildTeamDataReadiness(projectedState, weeklyImport?.summary ?? null);
    const aiAnswer = await aiProvider.answerTeamQuestion(
      buildTeamAiContext(projectedState, question, normalizeConversationHistory(body.conversationHistory), weekContext, waiverSummary, lineupSummary, activitySummary, dataReadiness),
    );

    return c.json({
      provider: aiAnswer.provider,
      question,
      answer: aiAnswer.answer,
      ...toTeamPayload(
        projectedState,
        weekContext,
        projectedAvailablePlayers,
        activitySummary,
        weeklyImport?.summary ?? null,
        rosImport?.summary ?? null,
      ),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/leagues/:leagueId/rankings/ros", async (c) => {
  try {
    const leagueId = c.req.param("leagueId");
    const season = c.req.query("season")?.trim();
    const scoring = c.req.query("scoring")?.trim();
    if (!season || !scoring) {
      return c.json({ summary: null });
    }
    const storedImport = rosRankingImportStore.get({
      leagueId,
      season,
      scoring: normalizeScoringFormat(scoring),
    });
    return c.json({ summary: storedImport?.summary ?? null });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/leagues/:leagueId/rankings/ros/import", async (c) => {
  try {
    const leagueId = c.req.param("leagueId");
    const userRosterId = getUserRosterId(c);
    const body = RosRankingImportRequestSchema.parse(await c.req.json());
    const [state, weekContext, availablePlayers, activitySummary, importPlayers] = await Promise.all([
      sleeperClient.getTeamManagerState(leagueId, userRosterId),
      sleeperClient.getTeamWeekContext(leagueId, getWeek(c), userRosterId).catch(() => null),
      sleeperClient.getAvailablePlayers(leagueId).catch(() => []),
      sleeperClient.getTeamActivitySummary(leagueId, getWeek(c)).catch(() => null),
      sleeperClient.getProjectionImportPlayers(),
    ]);
    if (!isRosScoringCompatible(body.scoring, state.league.scoring)) {
      return c.json({
        error: `The ${body.scoring} ROS rankings do not match this ${state.league.scoring} league.`,
      }, 400);
    }
    const playerPool = uniquePlayers([...getTeamRosterPlayers(state), ...importPlayers]);
    const storedImport = importFantasyProsRosRankings({
      players: playerPool,
      season: body.season,
      scoring: body.scoring,
      csvText: body.csvText,
    });
    rosRankingImportStore.set({
      leagueId,
      season: body.season,
      scoring: body.scoring,
    }, storedImport);

    const activeRosImport = isRosRankingImportActive(state, storedImport) ? storedImport : null;
    const rankedState = applyRosRankingsToTeamState(state, activeRosImport);
    const selectedWeek = getWeek(c) ?? state.week ?? 1;
    const weeklyImport = getWeeklyProjectionImport(c, leagueId, state.league.season, selectedWeek);
    const activeWeeklyImport = isWeeklyProjectionImportActive(state, weeklyImport, selectedWeek) ? weeklyImport : null;
    const projectedState = applyWeeklyProjectionsToTeamState(rankedState, activeWeeklyImport);
    const availableWithDraftValues = applyTeamRankingImport(c, availablePlayers);
    const availableWithRos = applyRosRankingsToPlayers(availableWithDraftValues, activeRosImport);
    const projectedAvailablePlayers = applyWeeklyProjectionsToPlayers(availableWithRos, activeWeeklyImport);

    return c.json({
      summary: storedImport.summary,
      ...toTeamPayload(
        projectedState,
        weekContext,
        projectedAvailablePlayers,
        activitySummary,
        weeklyImport?.summary ?? null,
        storedImport.summary,
      ),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.delete("/leagues/:leagueId/rankings/ros", async (c) => {
  try {
    const leagueId = c.req.param("leagueId");
    const season = c.req.query("season")?.trim();
    const scoring = c.req.query("scoring")?.trim();
    if (!season || !scoring) {
      return c.json({ deleted: false });
    }
    return c.json({
      deleted: rosRankingImportStore.delete({
        leagueId,
        season,
        scoring: normalizeScoringFormat(scoring),
      }),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/leagues/:leagueId/projections/weekly", async (c) => {
  try {
    const leagueId = c.req.param("leagueId");
    const season = c.req.query("season")?.trim();
    const week = getWeek(c);
    if (!season || !week) {
      return c.json({ summary: null });
    }

    const storedImport = weeklyProjectionImportStore.get({ leagueId, season, week });
    return c.json({ summary: storedImport?.summary ?? null });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/leagues/:leagueId/projections/weekly/import", async (c) => {
  try {
    const leagueId = c.req.param("leagueId");
    const userRosterId = getUserRosterId(c);
    const rawBody = await c.req.json();
    const batchBody = WeeklyProjectionBatchImportRequestSchema.safeParse(rawBody);
    const singleBody = batchBody.success ? null : WeeklyProjectionImportRequestSchema.parse(rawBody);
    const season = batchBody.success ? batchBody.data.season : singleBody!.season;
    const week = batchBody.success ? batchBody.data.week : singleBody!.week;
    const files = batchBody.success
      ? batchBody.data.files
      : [{ position: singleBody!.position ?? null, csvText: singleBody!.csvText }];
    const [state, weekContext, availablePlayers, activitySummary, projectionImportPlayers] = await Promise.all([
      sleeperClient.getTeamManagerState(leagueId, userRosterId),
      sleeperClient.getTeamWeekContext(leagueId, week, userRosterId).catch(() => null),
      sleeperClient.getAvailablePlayers(leagueId).catch(() => []),
      sleeperClient.getTeamActivitySummary(leagueId, week).catch(() => null),
      sleeperClient.getProjectionImportPlayers(),
    ]);
    const playerPool = uniquePlayers([...getTeamRosterPlayers(state), ...projectionImportPlayers]);
    let storedImport = weeklyProjectionImportStore.get({ leagueId, season, week });
    for (const file of files) {
      const incomingImport = importFantasyProsWeeklyProjectionCsv({
        players: playerPool,
        leagueId,
        season,
        week,
        csvText: file.csvText,
        position: file.position,
      });
      storedImport = mergeWeeklyProjectionImports(storedImport, incomingImport);
    }
    weeklyProjectionImportStore.set({ leagueId, season, week }, storedImport!);
    const activeWeeklyImport = isWeeklyProjectionImportActive(state, storedImport, week) ? storedImport : null;
    const rosImport = getRosRankingImport(c, leagueId, state.league.season, state.league.scoring);
    const activeRosImport = isRosRankingImportActive(state, rosImport) ? rosImport : null;
    const rankedState = applyRosRankingsToTeamState(state, activeRosImport);
    const projectedState = applyWeeklyProjectionsToTeamState(rankedState, activeWeeklyImport);
    const rankedAvailablePlayers = applyTeamRankingImport(c, availablePlayers);
    const availableWithRos = applyRosRankingsToPlayers(rankedAvailablePlayers, activeRosImport);
    const projectedAvailablePlayers = applyWeeklyProjectionsToPlayers(availableWithRos, activeWeeklyImport);

    return c.json({
      summary: storedImport!.summary,
      ...toTeamPayload(
        projectedState,
        weekContext,
        projectedAvailablePlayers,
        activitySummary,
        storedImport!.summary,
        rosImport?.summary ?? null,
      ),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.delete("/leagues/:leagueId/projections/weekly", async (c) => {
  try {
    const leagueId = c.req.param("leagueId");
    const season = c.req.query("season")?.trim();
    const week = getWeek(c);
    if (!season || !week) {
      return c.json({ deleted: false });
    }

    return c.json({ deleted: weeklyProjectionImportStore.delete({ leagueId, season, week }) });
  } catch (error) {
    return handleRouteError(c, error);
  }
});
app.get("/drafts/:draftId/state", async (c) => {
  try {
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c), c.req.query("userIdentifier"));
    const draftId = c.req.param("draftId");
    return c.json(toDraftPayload(state, draftId, { recordTrigger: "state-load", userRosterId: getUserRosterId(c) }));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/rankings/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const body = RankingImportRequestSchema.parse(await c.req.json());
    const storedImport = importFantasyProsCsv(state, body.csvText, body.scoring);
    if (!isDraftRankingImportCompatible(state, storedImport)) {
      return c.json({
        error: `The ${body.scoring} rankings do not match this ${state.settings.scoring} league.`,
      }, 400);
    }
    rankingImportStore.set(draftId, storedImport);
    const importedState = applyDraftData(draftId, state);

    return c.json({
      summary: storedImport.summary,
      ...toDraftPayload(importedState, draftId, { recordTrigger: "rankings-import", userRosterId: getUserRosterId(c) }),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/projections/season/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const body = SeasonProjectionImportRequestSchema.parse(await c.req.json());
    const storedImport = importFantasyProsSeasonProjectionCsvs({
      state,
      season: body.season,
      files: body.files,
    });
    seasonProjectionImportStore.set(draftId, storedImport);
    return c.json({
      summary: storedImport.summary,
      ...toDraftPayload(applyDraftData(draftId, state), draftId, {
        recordTrigger: "rankings-import",
        userRosterId: getUserRosterId(c),
      }),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.delete("/drafts/:draftId/projections/season/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    seasonProjectionImportStore.delete(draftId);
    const state = await loadDraftState(draftId, getUserRosterId(c));
    return c.json(toDraftPayload(state, draftId, {
      recordTrigger: "rankings-clear",
      userRosterId: getUserRosterId(c),
    }));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/adp/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const body = AdpImportRequestSchema.parse(await c.req.json());
    const storedImport = importFantasyProsAdpCsv({
      state,
      season: body.season,
      csvText: body.csvText,
    });
    adpImportStore.set(draftId, storedImport);
    return c.json({
      summary: storedImport.summary,
      ...toDraftPayload(applyDraftData(draftId, state), draftId, {
        recordTrigger: "rankings-import",
        userRosterId: getUserRosterId(c),
      }),
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.delete("/drafts/:draftId/adp/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    adpImportStore.delete(draftId);
    const state = await loadDraftState(draftId, getUserRosterId(c));
    return c.json(toDraftPayload(state, draftId, {
      recordTrigger: "rankings-clear",
      userRosterId: getUserRosterId(c),
    }));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.delete("/drafts/:draftId/rankings/import", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    rankingImportStore.delete(draftId);
    const state = await loadDraftState(draftId, getUserRosterId(c));
    return c.json(toDraftPayload(state, draftId, { recordTrigger: "rankings-clear", userRosterId: getUserRosterId(c) }));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/drafts/:draftId/recommendations", async (c) => {
  try {
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
    const draftId = c.req.param("draftId");
    const recommendation = buildDraftRecommendation(state);
    decisionLogStore.record({ draftId, state, recommendation, trigger: "manual-refresh", userRosterId: getUserRosterId(c) });
    return c.json(recommendation);
  } catch (error) {
    return handleRouteError(c, error);
  }
});
app.post("/drafts/:draftId/recommendations", async (c) => {
  try {
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
    const body = (await c.req.json<{ recommendationPreferences?: DraftRecommendationOptions["preferences"] }>().catch(() => ({}))) as { recommendationPreferences?: DraftRecommendationOptions["preferences"] };
    const draftId = c.req.param("draftId");
    const recommendation = buildDraftRecommendation(state, { preferences: normalizeRecommendationPreferences(body.recommendationPreferences) });
    decisionLogStore.record({ draftId, state, recommendation, trigger: "manual-refresh", userRosterId: getUserRosterId(c) });
    return c.json(recommendation);
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/strategy", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const body = await c.req
      .json<{
        userPreferences?: { pinned?: string[]; faded?: string[]; excluded?: string[] };
        recommendationPreferences?: DraftRecommendationOptions["preferences"];
      }>()
      .catch(() => ({ userPreferences: undefined, recommendationPreferences: undefined }));
    const recommendationPreferences = normalizeRecommendationPreferences(body.recommendationPreferences);
    const recommendation = buildDraftRecommendation(state, { preferences: recommendationPreferences });
    const snapshot = createDraftPlayerSnapshot(state, {
      pinned: recommendationPreferences?.pinnedPlayerIds ?? [],
      faded: recommendationPreferences?.fadedPlayerIds ?? [],
      excluded: recommendationPreferences?.excludedPlayerIds ?? [],
    });
    if (snapshot.players.every((player) => snapshot.preferences.excluded.has(player.id))) {
      return c.json({ error: "No available players can be evaluated for this pick." }, 409);
    }
    const tools = createDraftStrategyTools(snapshot);
    const provider = aiProviderManager.get(settingsStore.get());
    const providerStatus = provider.status();
    const storedPlan = draftPlanStore.get(draftId, state.userTeamId, providerStatus.id);
    const previousPlan = storedPlan && storedPlan.updatedAtPick <= state.currentPick ? storedPlan : null;
    const strategyInstructions = draftStrategyInstructionStore.list(draftId, state.userTeamId, state.currentPick);
    const strategy = await provider.strategizeDraft(
      buildDraftStrategyContext(
        state,
        normalizeUserPreferences(body.userPreferences),
        snapshot,
        previousPlan,
        strategyInstructions,
      ),
      tools,
    );
    const latestState = await loadDraftState(draftId, getUserRosterId(c));
    if (latestState.currentPick !== state.currentPick) {
      return c.json({ error: "The draft board changed while AI strategy was running. Refreshing the recommendation." }, 409);
    }
    const availableIds = new Set(
      snapshot.players
        .filter((player) => !snapshot.preferences.excluded.has(player.id))
        .map((player) => player.id),
    );
    const recommendedCandidate = availableIds.has(strategy.decision.recommendedPlayerId)
      ? buildDraftOptionForPlayer(state, strategy.decision.recommendedPlayerId, { preferences: recommendationPreferences })
      : null;
    if (
      strategy.decision.basedOnPick !== state.currentPick ||
      strategy.decision.plan.updatedAtPick !== state.currentPick ||
      !recommendedCandidate ||
      !isDraftChoiceRosterFeasible(state, recommendedCandidate.player.id)
    ) {
      return c.json({ error: "The AI strategy did not match the current draft board." }, 502);
    }
    const alternativeCandidates = Array.from(new Set(strategy.decision.alternativePlayerIds))
      .filter((playerId) => playerId !== recommendedCandidate.player.id)
      .filter((playerId) => availableIds.has(playerId) && isDraftChoiceRosterFeasible(state, playerId))
      .map((playerId) => buildDraftOptionForPlayer(state, playerId, { preferences: recommendationPreferences }))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .slice(0, 4);
    const currentPickFocus = Array.from(new Set([
      recommendedCandidate.player.position,
      ...strategy.decision.plan.currentPickFocus,
    ])).slice(0, 3);
    const decision = {
      ...strategy.decision,
      headline: `Take ${recommendedCandidate.player.name}`,
      alternativePlayerIds: alternativeCandidates.map((candidate) => candidate.player.id),
      plan: {
        ...strategy.decision.plan,
        currentPickFocus,
        positionsThatCanWait: strategy.decision.plan.positionsThatCanWait.filter(
          (position) => !currentPickFocus.includes(position),
        ),
      },
    };
    if (strategy.provider.id !== "noop") {
      draftPlanStore.set(draftId, state.userTeamId, strategy.provider.id, decision.plan);
    }

    decisionLogStore.record({
      draftId,
      state,
      recommendation: {
        ...recommendation,
        headline: decision.headline,
        recommendedPlayerId: recommendedCandidate.player.id,
        confidence: decision.confidence,
        summary: decision.summary,
        risks: decision.risks,
        candidates: [recommendedCandidate, ...alternativeCandidates],
      },
      aiStrategy: decision,
      trigger: "ai-strategy",
      userRosterId: getUserRosterId(c),
    });

    return c.json({
      provider: strategy.provider,
      pickNumber: state.currentPick,
      decision,
      recommendedCandidate,
      alternativeCandidates,
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/ask", async (c) => {
  try {
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
    const body = await c.req
      .json<{ question?: string; conversationHistory?: Array<{ role?: string; content?: string }>; userPreferences?: { pinned?: string[]; faded?: string[]; excluded?: string[] }; recommendationPreferences?: DraftRecommendationOptions["preferences"] }>()
      .catch(() => ({ question: "", conversationHistory: [], userPreferences: undefined, recommendationPreferences: undefined }));
    const question = body.question?.trim() ?? "";
    if (!question) {
      return c.json({ error: "Ask a question before requesting AI advice." }, 400);
    }
    const conversationHistory = normalizeConversationHistory(body.conversationHistory);
    const userPreferences = normalizeUserPreferences(body.userPreferences);
    const draftId = c.req.param("draftId");
    const recommendationPreferences = normalizeRecommendationPreferences(body.recommendationPreferences);
    const recommendation = buildDraftRecommendation(state, { preferences: recommendationPreferences });
    const snapshot = createDraftPlayerSnapshot(state, {
      pinned: recommendationPreferences?.pinnedPlayerIds ?? userPreferences.pinned,
      faded: recommendationPreferences?.fadedPlayerIds ?? userPreferences.faded,
      excluded: recommendationPreferences?.excludedPlayerIds ?? userPreferences.excluded,
    });
    decisionLogStore.record({ draftId, state, recommendation, trigger: "ai-question", userRosterId: getUserRosterId(c) });
    const aiProvider = aiProviderManager.get(settingsStore.get());
    const strategyInstructions = draftStrategyInstructionStore.list(draftId, state.userTeamId, state.currentPick);
    const aiAnswer = await aiProvider.answerDraftQuestion(
      buildDraftQuestionContext(state, question, conversationHistory, userPreferences, snapshot, [], strategyInstructions),
      createDraftStrategyTools(snapshot),
    );

    return c.json({
      provider: aiAnswer.provider,
      question,
      answer: aiAnswer.answer,
      strategyProposal: aiAnswer.strategyProposal ?? null,
      recommendation,
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.post("/drafts/:draftId/candidates/:playerId/evaluate", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const playerId = c.req.param("playerId");
    const state = await loadDraftState(draftId, getUserRosterId(c));
    const body = (await c.req
      .json<{ recommendationPreferences?: DraftRecommendationOptions["preferences"] }>()
      .catch(() => ({}))) as { recommendationPreferences?: DraftRecommendationOptions["preferences"] };
    const recommendationPreferences = normalizeRecommendationPreferences(body.recommendationPreferences);
    const recommendation = buildDraftRecommendation(state, { preferences: recommendationPreferences });
    const userPreferences = {
      pinned: recommendationPreferences?.pinnedPlayerIds ?? [],
      faded: recommendationPreferences?.fadedPlayerIds ?? [],
      excluded: recommendationPreferences?.excludedPlayerIds ?? [],
    };
    const strategyInstructions = draftStrategyInstructionStore.list(
      draftId,
      state.userTeamId,
      state.currentPick,
    );
    const snapshot = createDraftPlayerSnapshot(state, userPreferences);
    const candidate = snapshot.players.find(
      (player) => player.id === playerId && !snapshot.preferences.excluded.has(player.id),
    );
    if (!candidate) {
      return c.json({ error: "That player is no longer available for this draft pick." }, 409);
    }

    decisionLogStore.record({
      draftId,
      state,
      recommendation,
      trigger: "candidate-evaluation",
      userRosterId: getUserRosterId(c),
    });
    const question = [
      `Evaluate drafting ${candidate.name} (${candidate.position}, ${candidate.team}) at pick ${state.currentPick}.`,
      "Give a direct verdict using Prefer, Reasonable, or Avoid.",
      "Then provide 2-4 concise reasons, search for the strongest credible alternative, and give the next two positional priorities if this player is selected.",
      "Reason independently from the roster, board, settings, and raw player evidence; identify important data limitations.",
      "Do not claim access to news or information outside the supplied draft context.",
    ].join(" ");
    const aiProvider = aiProviderManager.get(settingsStore.get());
    const aiAnswer = await aiProvider.answerDraftQuestion(
      buildDraftQuestionContext(state, question, [], userPreferences, snapshot, [playerId], strategyInstructions),
      createDraftStrategyTools(snapshot),
    );
    const latestState = await loadDraftState(draftId, getUserRosterId(c));
    if (latestState.currentPick !== state.currentPick) {
      return c.json({ error: "The draft board changed while AI evaluation was running. Refreshing the recommendation." }, 409);
    }

    return c.json({
      provider: aiAnswer.provider,
      playerId,
      playerName: candidate.name,
      pickNumber: state.currentPick,
      answer: aiAnswer.answer,
    });
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/drafts/:draftId/decisions", (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json({ snapshots: decisionLogStore.list(c.req.param("draftId"), Number.isFinite(limit) ? limit : 50) });
});

app.get("/drafts/:draftId/events", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const userRosterId = getUserRosterId(c);

    if (isMockDraft(draftId)) {
      return streamMockDraftEvents();
    }

    return await streamSleeperDraftEvents(draftId, userRosterId);
  } catch (error) {
    return handleRouteError(c, error);
  }
});

async function loadDraftState(
  draftId: string,
  userRosterId?: string | null,
  userIdentifier?: string | null,
): Promise<DraftState> {
  if (isMockDraft(draftId)) {
    return applyDraftData(draftId, mockState);
  }

  const state = await sleeperClient.getDraftState(draftId, userRosterId, userIdentifier);
  return applyDraftData(draftId, state);
}

function applyDraftData(draftId: string, state: DraftState): DraftState {
  return adpImportStore.apply(
    draftId,
    seasonProjectionImportStore.apply(draftId, rankingImportStore.apply(draftId, state)),
  );
}

function toTeamPayload(
  state: TeamManagerState,
  weekContext: TeamWeekContext | null = null,
  availablePlayers: Player[] = [],
  activitySummary: TeamActivitySummary | null = null,
  weeklyProjectionSummary: WeeklyProjectionImportSummary | null = null,
  rosRankingSummary: RosRankingImportSummary | null = null,
): TeamPayload {
  return {
    state,
    dataReadiness: buildTeamDataReadiness(state, weeklyProjectionSummary),
    needs: buildTeamNeedsSummary(state),
    lineupSummary: buildTeamLineupSummary(state),
    weekContext,
    waiverSummary: buildTeamWaiverSummary(state, availablePlayers),
    activitySummary: activitySummary ?? emptyActivitySummary(),
    rosRankingSummary,
    weeklyProjectionSummary,
  };
}
function emptyActivitySummary(): TeamActivitySummary {
  return {
    headline: "No Sleeper activity context is loaded yet.",
    week: null,
    recentTransactions: [],
    trendingAdds: [],
    trendingDrops: [],
    facts: ["No Sleeper activity context is loaded yet."],
    limitations: ["Sleeper activity could not be loaded for this team payload."],
    updatedAt: new Date().toISOString(),
  };
}

function toDraftPayload(state: DraftState, draftId: string, options: DraftPayloadOptions = {}): DraftPayload {
  const recommendation = options.recommendation ?? buildDraftRecommendation(state);
  if (options.recordTrigger) {
    decisionLogStore.record({
      draftId,
      state,
      recommendation,
      trigger: options.recordTrigger,
      userRosterId: options.userRosterId,
    });
  }

  return {
    state,
    recommendation,
    rankingImportSummary: rankingImportStore.get(draftId)?.summary ?? null,
    seasonProjectionImportSummary: seasonProjectionImportStore.get(draftId)?.summary ?? null,
    adpImportSummary: adpImportStore.get(draftId)?.summary ?? null,
  };
}

function createHealthPayload() {
  return {
    ok: true,
    service: "sleeper-ai-api",
    capabilities: {
      decisionLog: true,
      draftLeagueId: true,
      sqliteStorage: true,
    },
    now: new Date().toISOString(),
  };
}

function createDiagnosticsPayload() {
  return {
    ...createHealthPayload(),
    diagnosticsVersion: 1,
    settings: redactSettings(settingsStore.get()),
    storage: {
      sqliteStorage: true,
      settingsRecords: appDatabase.countJson("settings"),
      rankingImportRecords: appDatabase.countJson("ranking_imports"),
      seasonProjectionImportRecords: appDatabase.countJson("season_projection_imports"),
      adpImportRecords: appDatabase.countJson("adp_imports"),
      rosRankingImportRecords: appDatabase.countJson("ros_ranking_imports"),
      weeklyProjectionImportRecords: appDatabase.countJson("weekly_projection_imports"),
      decisionSnapshots: appDatabase.countDecisionSnapshots(),
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      packagedDataDir: Boolean(process.env.SLEEPER_AI_DATA_DIR),
    },
  };
}

function redactSettings(settings: AppSettings) {
  return {
    aiProvider: settings.aiProvider,
    codexBinConfigured: settings.codexBin.trim().length > 0,
    codexModel: settings.codexModel,
    codexTimeoutMs: settings.codexTimeoutMs,
  };
}
function normalizeRecommendationPreferences(preferences: DraftRecommendationOptions["preferences"] | undefined): DraftRecommendationOptions["preferences"] {
  return {
    pinnedPlayerIds: normalizePreferenceNames(preferences?.pinnedPlayerIds),
    fadedPlayerIds: normalizePreferenceNames(preferences?.fadedPlayerIds),
    excludedPlayerIds: normalizePreferenceNames(preferences?.excludedPlayerIds),
  };
}
function normalizeUserPreferences(preferences: { pinned?: string[]; faded?: string[]; excluded?: string[] } | undefined) {
  return {
    pinned: normalizePreferenceNames(preferences?.pinned),
    faded: normalizePreferenceNames(preferences?.faded),
    excluded: normalizePreferenceNames(preferences?.excluded),
  };
}

function normalizePreferenceNames(names: string[] | undefined): string[] {
  return Array.from(new Set((names ?? []).map((name) => name.trim()).filter(Boolean))).slice(0, 20);
}
function normalizeConversationHistory(history: Array<{ role?: string; content?: string }> | undefined) {
  return (history ?? [])
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content!.trim() }))
    .filter((message) => message.content.length > 0)
    .slice(-8);
}
function getUserRosterId(c: Context): string | null {
  return c.req.query("userRosterId") ?? null;
}

function getWeeklyProjectionImport(c: Context, leagueId: string, fallbackSeason: string | null, fallbackWeek: number | null = null) {
  const week = getWeek(c) ?? fallbackWeek;
  const season = c.req.query("season")?.trim() || fallbackSeason;
  if (!season || !week) {
    return null;
  }

  return weeklyProjectionImportStore.get({ leagueId, season, week });
}

function getRosRankingImport(
  c: Context,
  leagueId: string,
  fallbackSeason: string | null,
  fallbackScoring: string,
) {
  const season = c.req.query("season")?.trim() || fallbackSeason;
  const scoring = c.req.query("scoring")?.trim() || fallbackScoring;
  if (!season) {
    return null;
  }
  return rosRankingImportStore.get({
    leagueId,
    season,
    scoring: normalizeScoringFormat(scoring),
  });
}

function getTeamRosterPlayers(state: TeamManagerState): Player[] {
  return uniquePlayers([
    ...state.roster.starters.map((slot) => slot.player).filter(isPlayer),
    ...state.roster.bench,
    ...state.roster.injuredReserve,
    ...state.roster.taxi,
  ]);
}

function uniquePlayers(players: Player[]): Player[] {
  return Array.from(new Map(players.map((player) => [player.id, player])).values());
}

function isPlayer(player: Player | null): player is Player {
  return Boolean(player);
}

function applyTeamRankingImport(c: Context, players: Player[]) {
  const draftId = c.req.query("draftId") ?? null;
  const rankingImport = draftId ? rankingImportStore.get(draftId) : null;
  const seasonProjectionImport = draftId ? seasonProjectionImportStore.get(draftId) : null;
  const adpImport = draftId ? adpImportStore.get(draftId) : null;
  return players.map((player) => applyAdpValue(
    applySeasonProjectionValue(applyImportedPlayerValues(player, rankingImport), seasonProjectionImport),
    adpImport,
  ));
}

function getWeek(c: Context): number | null {
  const rawWeek = c.req.query("week");
  if (!rawWeek) {
    return null;
  }

  const week = Number(rawWeek);
  return Number.isInteger(week) && week > 0 ? week : null;
}

function isMockDraft(draftId: string): boolean {
  return draftId === "mock" || draftId === "mock-draft";
}

function logRouteError(c: Context, error: unknown) {
  const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
  console.error(`[api] ${c.req.method} ${c.req.path} failed: ${message}`);
}

function handleRouteError(c: Context, error: unknown) {
  logRouteError(c, error);

  if (error instanceof SleeperApiError) {
    const status = error.status === 404 ? 404 : 502;
    return c.json({ error: status === 404 ? "Sleeper resource not found." : "Sleeper request failed." }, status);
  }

  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
    return c.json({ error: "Invalid request data." }, 400);
  }

  return c.json({ error: "The local service could not complete this request." }, 500);
}

export function redactErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/\b((?:access|refresh)[_-]?token)\b\s*[:=]\s*[^\s,}]+/gi, "$1=[redacted]")
    .replace(/(?:[A-Za-z]:\\Users\\|\/home\/)[^\\/\s]+/g, "[home]")
    .slice(0, 500);
}

function streamMockDraftEvents(): Response {
  const channel = createEventStreamChannel();
  let localState: DraftState = applyDraftData("mock-draft", mockState);
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      channel.send(controller, "snapshot", {
        type: "snapshot",
        ...toDraftPayload(localState, "mock-draft"),
      });

      interval = setInterval(() => {
        if (localState.status === "complete") {
          channel.send(controller, "heartbeat", {
            type: "heartbeat",
            at: new Date().toISOString(),
          });
          return;
        }

        const previousPickCount = mockState.picks.length;
        mockState = advanceMockDraftState(mockState);
        localState = applyDraftData("mock-draft", mockState);
        const pick = localState.picks[previousPickCount];

        channel.send(controller, "pick", {
          type: "pick",
          pick,
          ...toDraftPayload(localState, "mock-draft"),
        });
      }, 4500);
    },
    cancel() {
      channel.close();
      if (interval) {
        clearInterval(interval);
      }
    },
  });

  return createEventStreamResponse(stream);
}

async function streamSleeperDraftEvents(draftId: string, userRosterId: string | null): Promise<Response> {
  const channel = createEventStreamChannel();
  let localState = await loadDraftState(draftId, userRosterId);
  let lastPickCount = localState.picks.length;
  let consecutiveFailures = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      channel.send(controller, "snapshot", {
        type: "snapshot",
        ...toDraftPayload(localState, draftId),
      });

      scheduleRefresh(controller);
    },
    cancel() {
      cancelled = true;
      channel.close();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    },
  });

  return createEventStreamResponse(stream);

  function scheduleRefresh(
    controller: ReadableStreamDefaultController<Uint8Array>,
    delay = draftPollDelayMs(consecutiveFailures, localState.status),
  ) {
    if (cancelled) {
      return;
    }
    refreshTimer = setTimeout(() => {
      void refresh(controller);
    }, delay);
  }

  async function refresh(controller: ReadableStreamDefaultController<Uint8Array>) {
    let sent = false;
    try {
      const picks = await sleeperClient.getDraftPicks(draftId);
      consecutiveFailures = 0;
      const previousPickCount = lastPickCount;

      if (picks.length !== previousPickCount) {
        const nextState = await loadDraftState(draftId, userRosterId);
        localState = nextState;
        lastPickCount = nextState.picks.length;
        sent = channel.send(controller, "pick", {
          type: "pick",
          pick: nextState.picks[nextState.picks.length - 1],
          ...toDraftPayload(nextState, draftId, { recordTrigger: "pick-update", userRosterId }),
        });
      } else {
        sent = channel.send(controller, "heartbeat", {
          type: "heartbeat",
          at: new Date().toISOString(),
        });
      }
    } catch (error) {
      consecutiveFailures += 1;
      logRouteErrorMessage("draft event refresh", error);
      sent = channel.send(controller, "stream-error", {
        type: "stream-error",
        at: new Date().toISOString(),
        message: "Sleeper is temporarily unavailable. Automatic retry will continue.",
        consecutiveFailures,
        nextRetryMs: draftPollDelayMs(consecutiveFailures, localState.status),
      });
    } finally {
      if (sent) {
        scheduleRefresh(controller);
      }
    }
  }
}

function logRouteErrorMessage(context: string, error: unknown) {
  const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
  console.error(`[api] ${context} failed: ${message}`);
}

function createEventStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

if (process.env.NODE_ENV !== "test") {
  const shutdown = () => {
    aiProviderManager.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  serve(
    {
      fetch: app.fetch,
      hostname,
      port,
    },
    (info) => {
      console.log(`Sleeper Draft Assistant API listening on http://${hostname}:${info.port}`);
    },
  );
}























