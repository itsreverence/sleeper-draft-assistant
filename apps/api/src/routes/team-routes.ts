import { buildTeamDataReadiness } from "@sleeper-draft-assistant/engine";
import {
  RosRankingImportRequestSchema,
  WeeklyProjectionBatchImportRequestSchema,
  WeeklyProjectionImportRequestSchema,
  type Player,
  type RosRankingImportSummary,
  type TeamActivitySummary,
  type TeamDataReadiness,
  type TeamManagerState,
  type TeamWeekContext,
  type WeeklyProjectionImportSummary,
} from "@sleeper-draft-assistant/shared";
import type { Hono } from "hono";
import type { Context } from "hono";

import type { AiProviderManager } from "../ai/provider-factory";
import { buildTeamAiContext } from "../ai/team-context";
import {
  applyAdpValue,
  applySeasonProjectionValue,
  type AdpImportStore,
  type SeasonProjectionImportStore,
} from "../draft-value-import";
import { applyImportedPlayerValues, type RankingImportStore } from "../rankings-import";
import {
  applyRosRankingsToPlayers,
  applyRosRankingsToTeamState,
  importFantasyProsRosRankings,
  isRosRankingImportActive,
  isRosScoringCompatible,
  normalizeScoringFormat,
  type RosRankingImportStore,
} from "../ros-rankings-import";
import type { SettingsStore } from "../settings-store";
import type { SleeperClient } from "../sleeper";
import {
  applyWeeklyProjectionsToPlayers,
  applyWeeklyProjectionsToTeamState,
  importFantasyProsWeeklyProjectionCsv,
  isWeeklyProjectionImportActive,
  mergeWeeklyProjectionImports,
  WeeklyProjectionImportError,
  type WeeklyProjectionImportStore,
} from "../weekly-projections-import";
import type { RouteErrorHandler } from "./types";
import { getUserRosterId, normalizeConversationHistory } from "./request-context";

type TeamPayload = {
  state: TeamManagerState;
  dataReadiness: TeamDataReadiness;
  weekContext: TeamWeekContext | null;
  activitySummary: TeamActivitySummary;
  rosRankingSummary: RosRankingImportSummary | null;
  weeklyProjectionSummary: WeeklyProjectionImportSummary | null;
};

type TeamRouteDependencies = {
  sleeperClient: SleeperClient;
  aiProviderManager: AiProviderManager;
  getSettingsStore: () => SettingsStore;
  getRankingImportStore: () => RankingImportStore;
  getSeasonProjectionImportStore: () => SeasonProjectionImportStore;
  getAdpImportStore: () => AdpImportStore;
  getRosRankingImportStore: () => RosRankingImportStore;
  getWeeklyProjectionImportStore: () => WeeklyProjectionImportStore;
  handleRouteError: RouteErrorHandler;
};

export function registerTeamRoutes(app: Hono, dependencies: TeamRouteDependencies): void {
  const {
    sleeperClient,
    aiProviderManager,
    getSettingsStore,
    getRankingImportStore,
    getSeasonProjectionImportStore,
    getAdpImportStore,
    getRosRankingImportStore,
    getWeeklyProjectionImportStore,
    handleRouteError,
  } = dependencies;

  app.get("/leagues/:leagueId/team", async (c) => {
    try {
      const leagueId = c.req.param("leagueId");
      const userRosterId = getUserRosterId(c);
      const [state, weekContext, activitySummary] = await Promise.all([
        sleeperClient.getTeamManagerState(leagueId, userRosterId),
        sleeperClient.getTeamWeekContext(leagueId, getWeek(c), userRosterId).catch(() => null),
        sleeperClient.getTeamActivitySummary(leagueId, getWeek(c)).catch(() => null),
      ]);
      const selectedWeek = getWeek(c) ?? state.week ?? 1;
      const weeklyImport = getWeeklyProjectionImport(c, leagueId, state.league.season, selectedWeek);
      const activeWeeklyImport = isWeeklyProjectionImportActive(state, weeklyImport, selectedWeek) ? weeklyImport : null;
      const rosImport = getRosRankingImport(c, leagueId, state.league.season, state.league.scoring);
      const activeRosImport = isRosRankingImportActive(state, rosImport) ? rosImport : null;
      const rankedState = applyRosRankingsToTeamState(state, activeRosImport);
      const projectedState = applyWeeklyProjectionsToTeamState(rankedState, activeWeeklyImport);
      return c.json(toTeamPayload(
        projectedState,
        weekContext,
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
      const aiProvider = aiProviderManager.get(getSettingsStore().get());
      const dataReadiness = buildTeamDataReadiness(projectedState, weeklyImport?.summary ?? null);
      const aiAnswer = await aiProvider.answerTeamQuestion(
        buildTeamAiContext(
          projectedState,
          question,
          normalizeConversationHistory(body.conversationHistory),
          weekContext,
          projectedAvailablePlayers,
          activitySummary,
          dataReadiness,
          selectedWeek,
        ),
      );

      return c.json({
        provider: aiAnswer.provider,
        question,
        answer: aiAnswer.answer,
        ...toTeamPayload(
          projectedState,
          weekContext,
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
      const storedImport = getRosRankingImportStore().get({
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
      const [state, weekContext, activitySummary, importPlayers] = await Promise.all([
        sleeperClient.getTeamManagerState(leagueId, userRosterId),
        sleeperClient.getTeamWeekContext(leagueId, getWeek(c), userRosterId).catch(() => null),
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
      getRosRankingImportStore().set({
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

      return c.json({
        summary: storedImport.summary,
        ...toTeamPayload(
          projectedState,
          weekContext,
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
        deleted: getRosRankingImportStore().delete({
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

      const storedImport = getWeeklyProjectionImportStore().get({ leagueId, season, week });
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
      const [state, weekContext, activitySummary, projectionImportPlayers] = await Promise.all([
        sleeperClient.getTeamManagerState(leagueId, userRosterId),
        sleeperClient.getTeamWeekContext(leagueId, week, userRosterId).catch(() => null),
        sleeperClient.getTeamActivitySummary(leagueId, week).catch(() => null),
        sleeperClient.getProjectionImportPlayers(),
      ]);
      const playerPool = uniquePlayers([...getTeamRosterPlayers(state), ...projectionImportPlayers]);
      let storedImport = getWeeklyProjectionImportStore().get({ leagueId, season, week });
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
      getWeeklyProjectionImportStore().set({ leagueId, season, week }, storedImport!);
      const activeWeeklyImport = isWeeklyProjectionImportActive(state, storedImport, week) ? storedImport : null;
      const rosImport = getRosRankingImport(c, leagueId, state.league.season, state.league.scoring);
      const activeRosImport = isRosRankingImportActive(state, rosImport) ? rosImport : null;
      const rankedState = applyRosRankingsToTeamState(state, activeRosImport);
      const projectedState = applyWeeklyProjectionsToTeamState(rankedState, activeWeeklyImport);

      return c.json({
        summary: storedImport!.summary,
        ...toTeamPayload(
          projectedState,
          weekContext,
          activitySummary,
          storedImport!.summary,
          rosImport?.summary ?? null,
        ),
      });
    } catch (error) {
      if (error instanceof WeeklyProjectionImportError) {
        return c.json({ error: error.message }, 400);
      }
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

      return c.json({ deleted: getWeeklyProjectionImportStore().delete({ leagueId, season, week }) });
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  function getWeeklyProjectionImport(
    c: Context,
    leagueId: string,
    fallbackSeason: string | null,
    fallbackWeek: number | null = null,
  ) {
    const week = getWeek(c) ?? fallbackWeek;
    const season = c.req.query("season")?.trim() || fallbackSeason;
    if (!season || !week) {
      return null;
    }

    return getWeeklyProjectionImportStore().get({ leagueId, season, week });
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
    return getRosRankingImportStore().get({
      leagueId,
      season,
      scoring: normalizeScoringFormat(scoring),
    });
  }

  function applyTeamRankingImport(c: Context, players: Player[]) {
    const draftId = c.req.query("draftId") ?? null;
    const rankingImport = draftId ? getRankingImportStore().get(draftId) : null;
    const seasonProjectionImport = draftId ? getSeasonProjectionImportStore().get(draftId) : null;
    const adpImport = draftId ? getAdpImportStore().get(draftId) : null;
    return players.map((player) => applyAdpValue(
      applySeasonProjectionValue(applyImportedPlayerValues(player, rankingImport), seasonProjectionImport),
      adpImport,
    ));
  }
}

function toTeamPayload(
  state: TeamManagerState,
  weekContext: TeamWeekContext | null = null,
  activitySummary: TeamActivitySummary | null = null,
  weeklyProjectionSummary: WeeklyProjectionImportSummary | null = null,
  rosRankingSummary: RosRankingImportSummary | null = null,
): TeamPayload {
  return {
    state,
    dataReadiness: buildTeamDataReadiness(state, weeklyProjectionSummary),
    weekContext,
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

function getWeek(c: Context): number | null {
  const rawWeek = c.req.query("week");
  if (!rawWeek) {
    return null;
  }

  const week = Number(rawWeek);
  return Number.isInteger(week) && week > 0 ? week : null;
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
