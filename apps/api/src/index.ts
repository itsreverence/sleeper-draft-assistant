import { serve } from "@hono/node-server";
import {
  advanceMockDraftState,
  buildDraftRecommendation,
  buildTeamLineupSummary,
  buildTeamNeedsSummary,
  buildTeamWaiverSummary,
  createMockDraftState,
  type DraftRecommendationOptions,
} from "@sleeper-draft-assistant/engine";
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";

import { RankingImportRequestSchema, WeeklyProjectionBatchImportRequestSchema, WeeklyProjectionImportRequestSchema, type AppSettings, type DraftRecommendation, type DraftState, type RankingImportSummary, type Player, type TeamActivitySummary, type TeamLineupSummary, type TeamManagerState, type TeamNeedsSummary, type TeamWaiverSummary, type TeamWeekContext, type WeeklyProjectionImportSummary } from "@sleeper-draft-assistant/shared";

import { buildDraftAiContext } from "./ai/context";
import { buildTeamAiContext } from "./ai/team-context";
import { DecisionLogStore, type DecisionSnapshotTrigger } from "./decision-log-store";
import { createAiProvider } from "./ai/provider-factory";
import { applyImportedPlayerValues, importFantasyProsCsv, RankingImportStore } from "./rankings-import";
import { WeeklyProjectionImportStore, applyWeeklyProjectionsToPlayers, applyWeeklyProjectionsToTeamState, importFantasyProsWeeklyProjectionCsv, isWeeklyProjectionImportActive, mergeWeeklyProjectionImports } from "./weekly-projections-import";
import { getSleeperConnectOptions } from "./sleeper-connect";
import { SleeperApiError, SleeperClient } from "./sleeper";
import { SettingsStore } from "./settings-store";
import { SqliteAppDatabase } from "./sqlite-app-database";
import { requireApiToken } from "./api-auth";
import { parseApiPort } from "./config";

export const app = new Hono();
const port = parseApiPort(process.env.PORT);
const hostname = "127.0.0.1";
const apiToken = process.env.SLEEPER_AI_API_TOKEN?.trim() || null;
const sleeperClient = new SleeperClient();
const appDatabase = await SqliteAppDatabase.open();
const rankingImportStore = new RankingImportStore(undefined, appDatabase);
const weeklyProjectionImportStore = new WeeklyProjectionImportStore(undefined, appDatabase);
const decisionLogStore = new DecisionLogStore(undefined, 200, appDatabase);
const settingsStore = new SettingsStore(undefined, appDatabase);
let mockState = createMockDraftState(8);

type DraftPayload = {
  state: DraftState;
  recommendation: DraftRecommendation;
  rankingImportSummary: RankingImportSummary | null;
};

type DraftPayloadOptions = {
  recommendation?: DraftRecommendation;
  recordTrigger?: DecisionSnapshotTrigger;
  userRosterId?: string | null;
};

type TeamPayload = {
  state: TeamManagerState;
  needs: TeamNeedsSummary;
  lineupSummary: TeamLineupSummary;
  weekContext: TeamWeekContext | null;
  waiverSummary: TeamWaiverSummary;
  activitySummary: TeamActivitySummary;
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

app.get("/diagnostics", (c) =>
  c.json({
    ...createHealthPayload(),
    diagnosticsVersion: 1,
    settings: redactSettings(settingsStore.get()),
    storage: {
      sqliteStorage: true,
      settingsRecords: appDatabase.countJson("settings"),
      rankingImportRecords: appDatabase.countJson("ranking_imports"),
      weeklyProjectionImportRecords: appDatabase.countJson("weekly_projection_imports"),
      decisionSnapshots: appDatabase.countDecisionSnapshots(),
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      packagedDataDir: Boolean(process.env.SLEEPER_AI_DATA_DIR),
    },
  }),
);

app.get("/settings", (c) => c.json(settingsStore.get()));

app.put("/settings", async (c) => {
  try {
    const input = await c.req.json<Record<string, unknown>>();
    return c.json(settingsStore.update(input));
  } catch (error) {
    return handleRouteError(c, error);
  }
});

app.get("/ai/status", (c) => c.json(createAiProvider(settingsStore.get()).status()));

app.get("/drafts/mock/state", (c) => {
  return c.json(toDraftPayload(rankingImportStore.apply("mock-draft", mockState), "mock-draft"));
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
    const projectedState = applyWeeklyProjectionsToTeamState(state, activeWeeklyImport);
    const availableWithRanks = applyTeamRankingImport(c, availablePlayers);
    const projectedAvailablePlayers = applyWeeklyProjectionsToPlayers(availableWithRanks, activeWeeklyImport);
    return c.json(toTeamPayload(projectedState, weekContext, projectedAvailablePlayers, activitySummary, weeklyImport?.summary ?? null));
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
    const projectedState = applyWeeklyProjectionsToTeamState(state, activeWeeklyImport);
    const rankedAvailablePlayers = applyTeamRankingImport(c, availablePlayers);
    const projectedAvailablePlayers = applyWeeklyProjectionsToPlayers(rankedAvailablePlayers, activeWeeklyImport);
    const aiProvider = createAiProvider(settingsStore.get());
    const aiAnswer = await aiProvider.answerTeamQuestion(
      buildTeamAiContext(projectedState, question, normalizeConversationHistory(body.conversationHistory), weekContext, buildTeamWaiverSummary(projectedState, projectedAvailablePlayers), buildTeamLineupSummary(projectedState), activitySummary),
    );

    return c.json({
      provider: aiAnswer.provider,
      question,
      answer: aiAnswer.answer,
      ...toTeamPayload(projectedState, weekContext, projectedAvailablePlayers, activitySummary, weeklyImport?.summary ?? null),
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
    const projectedState = applyWeeklyProjectionsToTeamState(state, activeWeeklyImport);
    const rankedAvailablePlayers = applyTeamRankingImport(c, availablePlayers);
    const projectedAvailablePlayers = applyWeeklyProjectionsToPlayers(rankedAvailablePlayers, activeWeeklyImport);

    return c.json({
      summary: storedImport!.summary,
      ...toTeamPayload(projectedState, weekContext, projectedAvailablePlayers, activitySummary, storedImport!.summary),
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
    const state = await loadDraftState(c.req.param("draftId"), getUserRosterId(c));
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
    const storedImport = importFantasyProsCsv(state, body.csvText);
    rankingImportStore.set(draftId, storedImport);
    const importedState = rankingImportStore.apply(draftId, state);

    return c.json({
      summary: storedImport.summary,
      ...toDraftPayload(importedState, draftId, { recordTrigger: "rankings-import", userRosterId: getUserRosterId(c) }),
    });
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
    const recommendation = buildDraftRecommendation(state, { preferences: normalizeRecommendationPreferences(body.recommendationPreferences) });
    decisionLogStore.record({ draftId, state, recommendation, trigger: "ai-question", userRosterId: getUserRosterId(c) });
    const aiProvider = createAiProvider(settingsStore.get());
    const aiAnswer = await aiProvider.answerDraftQuestion(buildDraftAiContext(state, recommendation, question, conversationHistory, userPreferences));

    return c.json({
      provider: aiAnswer.provider,
      question,
      answer: aiAnswer.answer,
      recommendation,
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

async function loadDraftState(draftId: string, userRosterId?: string | null): Promise<DraftState> {
  if (isMockDraft(draftId)) {
    return rankingImportStore.apply(draftId, mockState);
  }

  const state = await sleeperClient.getDraftState(draftId, userRosterId);
  return rankingImportStore.apply(draftId, state);
}

function toTeamPayload(
  state: TeamManagerState,
  weekContext: TeamWeekContext | null = null,
  availablePlayers: Player[] = [],
  activitySummary: TeamActivitySummary | null = null,
  weeklyProjectionSummary: WeeklyProjectionImportSummary | null = null,
): TeamPayload {
  return {
    state,
    needs: buildTeamNeedsSummary(state),
    lineupSummary: buildTeamLineupSummary(state),
    weekContext,
    waiverSummary: buildTeamWaiverSummary(state, availablePlayers),
    activitySummary: activitySummary ?? emptyActivitySummary(),
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
  const storedImport = draftId ? rankingImportStore.get(draftId) : null;
  return players.map((player) => applyImportedPlayerValues(player, storedImport));
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
  const encoder = new TextEncoder();
  let localState: DraftState = rankingImportStore.apply("mock-draft", mockState);
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send(controller, "snapshot", {
        type: "snapshot",
        ...toDraftPayload(localState, "mock-draft"),
      });

      interval = setInterval(() => {
        if (localState.status === "complete") {
          send(controller, "heartbeat", {
            type: "heartbeat",
            at: new Date().toISOString(),
          });
          return;
        }

        const previousPickCount = mockState.picks.length;
        mockState = advanceMockDraftState(mockState);
        localState = rankingImportStore.apply("mock-draft", mockState);
        const pick = localState.picks[previousPickCount];

        send(controller, "pick", {
          type: "pick",
          pick,
          ...toDraftPayload(localState, "mock-draft"),
        });
      }, 4500);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    },
  });

  return createEventStreamResponse(stream);

  function send(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
    controller.enqueue(encoder.encode(`event: ${event}\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }
}

async function streamSleeperDraftEvents(draftId: string, userRosterId: string | null): Promise<Response> {
  const encoder = new TextEncoder();
  let localState = await loadDraftState(draftId, userRosterId);
  let lastPickCount = localState.picks.length;
  let consecutiveFailures = 0;
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send(controller, "snapshot", {
        type: "snapshot",
        ...toDraftPayload(localState, draftId),
      });

      interval = setInterval(() => {
        void refresh(controller);
      }, 5000);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    },
  });

  return createEventStreamResponse(stream);

  async function refresh(controller: ReadableStreamDefaultController<Uint8Array>) {
    try {
      const nextState = await loadDraftState(draftId, userRosterId);
      consecutiveFailures = 0;
      const previousPickCount = lastPickCount;
      localState = nextState;
      lastPickCount = nextState.picks.length;

      if (nextState.picks.length > previousPickCount) {
        send(controller, "pick", {
          type: "pick",
          pick: nextState.picks[nextState.picks.length - 1],
          ...toDraftPayload(nextState, draftId, { recordTrigger: "pick-update", userRosterId }),
        });
        return;
      }

      send(controller, "heartbeat", {
        type: "heartbeat",
        at: new Date().toISOString(),
      });
    } catch (error) {
      consecutiveFailures += 1;
      const message = error instanceof Error ? error.message : "Sleeper polling failed.";
      send(controller, "stream-error", {
        type: "stream-error",
        at: new Date().toISOString(),
        message,
        consecutiveFailures,
      });
    }
  }

  function send(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
    controller.enqueue(encoder.encode(`event: ${event}\n`));
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }
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























