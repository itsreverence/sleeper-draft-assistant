import type { Player, TeamManagerState } from "@sleeper-draft-assistant/shared";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { StoredRankingImport } from "../rankings-import";
import type { StoredSeasonValueRankingImport } from "../ros-rankings-import";
import { registerTeamRoutes } from "./team-routes";
import { LocalDataResetCoordinator, LocalDataResetError } from "../local-data-reset";

const player: Player = {
  id: "gibbs",
  sleeperId: "gibbs",
  name: "Jahmyr Gibbs",
  team: "DET",
  position: "RB",
  projectedPoints: 0,
  projectionSource: "sleeper_search_rank",
  adp: null,
  tier: null,
  riskTags: [],
};

const state: TeamManagerState = {
  league: {
    id: "league-1",
    name: "Fixture League",
    season: "2026",
    status: "in_season",
    teams: 8,
    scoring: "PPR",
    rosterSlots: { RB: 1, BN: 1 },
  },
  userTeam: { rosterId: "1", ownerId: "user-1", name: "Fixture Team" },
  roster: {
    starters: [{ slot: "RB", eligiblePositions: ["RB"], player }],
    bench: [],
    injuredReserve: [],
    taxi: [],
    positionCounts: { QB: 0, RB: 1, WR: 0, TE: 0, K: 0, DEF: 0 },
  },
  seasonPhase: "regular",
  week: 1,
  updatedAt: "2026-09-01T00:00:00.000Z",
  dataQuality: { playerValueSource: "Sleeper", limitations: [] },
};

const draftCsv = `RK,TIERS,PLAYER NAME,TEAM,POS,BYE WEEK,ECR VS. ADP
1,1,Jahmyr Gibbs,DET,RB1,8,-`;
const rosCsv = `RK,PLAYER NAME,TEAM,POS,SOS SEASON,SOS PLAYOFFS,ECR VS. ADP
2,Jahmyr Gibbs,DET,RB1,3 out of 5 stars,4 out of 5 stars,-`;

describe("Team Manager season value routes", () => {
  it.each([
    ["rankings/ros/import", { season: "2026", scoring: "PPR", csvText: rosCsv }],
    ["projections/weekly/import", { season: "2026", week: 1, files: [{ position: "RB", csvText: "pending CSV" }] }],
  ])("rejects a pending %s import after local data reset", async (path, body) => {
    let resolveState!: (value: TeamManagerState) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const pendingState = new Promise<TeamManagerState>((resolve) => { resolveState = resolve; });
    const set = vi.fn();
    const localDataReset = new LocalDataResetCoordinator({
      database: { batch: (action: () => void) => action() } as never,
      getResetTargets: () => ({ clearers: [], settingsStore: { reset: () => ({}) } as never }),
      restoreStores: () => {},
      closeActiveProvider: () => {},
    });
    const app = new Hono();
    registerTeamRoutes(app, {
      localDataReset,
      sleeperClient: {
        getTeamManagerState: () => { markStarted(); return pendingState; },
        getTeamWeekContext: async () => null,
        getTeamActivitySummary: async () => null,
        getProjectionImportPlayers: async () => [player],
      } as never,
      aiProviderManager: {} as never,
      getSettingsStore: () => ({} as never),
      getRankingImportStore: () => ({ get: () => null }) as never,
      getSeasonProjectionImportStore: () => ({ get: () => null }) as never,
      getAdpImportStore: () => ({ get: () => null }) as never,
      getSeasonValueRankingImportStore: () => ({ get: () => null, set }) as never,
      getWeeklyProjectionImportStore: () => ({ get: () => null, set }) as never,
      handleRouteError: (context, error) => context.json({ error: String(error) }, error instanceof LocalDataResetError ? 409 : 500),
    });
    const response = app.request(`/leagues/league-1/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    await started;
    localDataReset.reset();
    resolveState(state);
    expect((await response).status).toBe(409);
    expect(set).not.toHaveBeenCalled();
  });

  it("reuses connected draft ECR, upgrades to ROS, and blocks a fallback downgrade", async () => {
    const draftImport: StoredRankingImport = {
      summary: {
        source: "fantasypros",
        scoring: "PPR",
        rowsParsed: 1,
        matched: 1,
        unmatched: [],
        ambiguous: [],
        appliedAt: "2026-08-20T00:00:00.000Z",
      },
      playersById: new Map([[player.id, {
        rank: 1,
        tier: 1,
        positionRank: 1,
        byeWeek: 8,
        ecrVsAdp: null,
        sosSeasonStars: null,
      }]]),
    };
    let explicitImport: StoredSeasonValueRankingImport | null = null;
    const app = new Hono();
    registerTeamRoutes(app, {
      localDataReset: new LocalDataResetCoordinator({} as never),
      sleeperClient: {
        getTeamManagerState: async () => structuredClone(state),
        getTeamWeekContext: async () => null,
        getTeamActivitySummary: async () => null,
        getAvailablePlayers: async () => [],
        getProjectionImportPlayers: async () => [player],
      } as never,
      aiProviderManager: {} as never,
      getSettingsStore: () => ({} as never),
      getRankingImportStore: () => ({ get: (draftId: string) => draftId === "draft-1" ? draftImport : null }) as never,
      getSeasonProjectionImportStore: () => ({ get: () => null }) as never,
      getAdpImportStore: () => ({ get: () => null }) as never,
      getSeasonValueRankingImportStore: () => ({
        get: () => explicitImport,
        set: (_key: unknown, value: StoredSeasonValueRankingImport) => { explicitImport = value; },
        delete: () => { explicitImport = null; return true; },
      }) as never,
      getWeeklyProjectionImportStore: () => ({ get: () => null }) as never,
      handleRouteError: (context, error) => context.json({ error: String(error) }, 500),
    });

    const fallbackResponse = await app.request("/leagues/league-1/team?userRosterId=1&draftId=draft-1");
    expect(fallbackResponse.status).toBe(200);
    const fallbackPayload = await fallbackResponse.json();
    expect(fallbackPayload.rosRankingSummary).toMatchObject({
      rankingType: "draft-ecr-fallback",
      rankingOrigin: "draft-import",
    });
    expect(fallbackPayload.state.roster.starters[0].player).toMatchObject({
      importedRank: 1,
      importedSource: "FantasyPros draft ECR fallback",
    });
    expect(fallbackPayload.state.roster.starters[0].player.rosRank).toBeUndefined();

    const rosResponse = await importRankings(app, rosCsv);
    expect(rosResponse.status).toBe(200);
    expect((await rosResponse.json()).summary.rankingType).toBe("ros-ecr");

    const teamResponse = await app.request("/leagues/league-1/team?userRosterId=1&draftId=draft-1");
    expect(teamResponse.status).toBe(200);
    const teamPayload = await teamResponse.json();
    expect(teamPayload.rosRankingSummary.rankingType).toBe("ros-ecr");
    expect(teamPayload.state.roster.starters[0].player).toMatchObject({
      rosRank: 2, rosPositionRank: 1, rosSource: "FantasyPros", rosBestRank: null,
    });
    expect(teamPayload.state.roster.starters[0].player.importedRank).toBeUndefined();

    const downgradeResponse = await importRankings(app, draftCsv);
    expect(downgradeResponse.status).toBe(409);
    expect(await downgradeResponse.json()).toEqual({
      error: "Current ROS ECR is already active. Draft ECR fallback cannot replace it.",
    });
    expect((explicitImport as unknown as StoredSeasonValueRankingImport).summary.rankingType).toBe("ros-ecr");

    const clearResponse = await app.request("/leagues/league-1/rankings/ros?season=2026&scoring=PPR", { method: "DELETE" });
    expect(await clearResponse.json()).toEqual({ deleted: true });
    const restoredResponse = await app.request("/leagues/league-1/team?userRosterId=1&draftId=draft-1");
    const restoredPayload = await restoredResponse.json();
    expect(restoredPayload.rosRankingSummary.rankingType).toBe("draft-ecr-fallback");
    expect(restoredPayload.state.roster.starters[0].player.rosRank).toBeUndefined();
    expect(restoredPayload.state.roster.starters[0].player.importedRank).toBe(1);
  });
});

function importRankings(app: Hono, csvText: string) {
  return app.request("/leagues/league-1/rankings/ros/import?userRosterId=1&draftId=draft-1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "fantasypros", season: "2026", scoring: "PPR", csvText }),
  });
}
