import { buildDraftRecommendation, createMockDraftState, type DraftRecommendationPreferences } from "@sleeper-draft-assistant/engine";

import type {
  AiProviderStatus,
  AdpImportSummary,
  AppSettings,
  DraftPayload,
  RankingImportSummary,
  SeasonProjectionImportSummary,
  TeamActivitySummary,
  TeamDataReadiness,
  TeamLineupSummary,
  TeamManagerState,
  TeamNeedsSummary,
  TeamPayload,
  TeamWaiverSummary,
} from "../types";

export const DEFAULT_LEAGUE_ID = "league-2026";
export const PIN_PLAYER_ID = "p-achane";

export function createAppSettingsFixture(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    aiProvider: "noop",
    codexBin: "codex",
    codexModel: "gpt-5.6-terra",
    codexTimeoutMs: 60_000,
    automaticAiAudit: "off",
    aiSetupAcknowledged: true,
    ...overrides,
  };
}

export function createAiProviderStatusFixture(overrides: Partial<AiProviderStatus> = {}): AiProviderStatus {
  return {
    id: "noop",
    label: "No AI provider",
    configured: false,
    ...overrides,
  };
}

export function createDraftPayloadFixture(input: {
  draftId: string;
  name: string;
  leagueId?: string;
  recommendationPreferences?: DraftRecommendationPreferences;
}): DraftPayload {
  const state = {
    ...createMockDraftState(8),
    id: input.draftId,
    name: input.name,
    leagueId: input.leagueId ?? DEFAULT_LEAGUE_ID,
    updatedAt: "2026-08-12T12:00:00.000Z",
  };

  const rankingImportSummary: RankingImportSummary = {
    source: "fantasypros",
    scoring: "PPR",
    rowsParsed: 1,
    matched: 1,
    unmatched: [],
    ambiguous: [],
    appliedAt: "2026-08-12T11:45:00.000Z",
  } as unknown as RankingImportSummary;

  const seasonProjectionImportSummary: SeasonProjectionImportSummary = {
    source: "fantasypros",
    season: "2026",
    scoring: "PPR",
    positions: ["QB", "RB", "WR", "TE", "K", "DEF"],
    rowsParsed: 6,
    matched: 6,
    unmatched: [],
    ambiguous: [],
    approximatePositions: [],
    warnings: [],
    appliedAt: "2026-08-12T11:46:00.000Z",
  };

  const adpImportSummary: AdpImportSummary = {
    source: "fantasypros",
    market: "Sleeper",
    season: "2026",
    rowsParsed: 1,
    matched: 1,
    unmatched: [],
    ambiguous: [],
    includesRealTime: true,
    appliedAt: "2026-08-12T11:47:00.000Z",
  };

  return {
    state,
    recommendation: buildDraftRecommendation(state, {
      preferences: input.recommendationPreferences,
    }),
    rankingImportSummary,
    seasonProjectionImportSummary,
    adpImportSummary,
  };
}

export function createTeamPayloadFixture(leagueId = DEFAULT_LEAGUE_ID): TeamPayload {
  const player = {
    id: "team-player-qb",
    sleeperId: "team-player-qb",
    name: "Team Quarterback",
    team: "CHI",
    position: "QB",
    projectedPoints: 20,
    projectionSource: "season_projection",
    adp: 10,
    tier: 2,
    riskTags: [],
    importedRank: 12,
  };

  const state = {
    league: {
      id: leagueId,
      name: "Fixture League",
      season: "2026",
      scoring: "PPR",
      formatCompatibility: {
        supported: true,
        warnings: [],
        unsupportedReasons: [],
      },
    },
    week: 1,
    roster: {
      starters: [{ slot: "QB", player }],
      bench: [],
    },
    updatedAt: "2026-08-12T12:00:00.000Z",
    userTeam: {
      rosterId: "roster-1",
      teamName: "My Team",
    },
    dataQuality: {
      lineup: "complete",
      waivers: "partial",
    },
  } as unknown as TeamManagerState;

  const dataReadiness = {
    status: "ready",
    warnings: [],
    confidence: "medium",
    headline: "Ready",
    facts: [],
    activeSeason: "2026",
    activeWeek: 1,
    rosAvailable: false,
    weeklyAvailable: false,
    rosScoring: null,
    weeklyScoring: null,
    rosImportedAt: null,
    weeklyImportedAt: null,
    rosAgeDays: null,
    weeklyAgeDays: null,
    eligibleRosterPlayers: 1,
  } as unknown as TeamDataReadiness;

  const needs = {
    headline: "RB depth needed",
    weakestPositions: ["RB", "WR"],
    openStarterSlots: ["RB"],
  } as TeamNeedsSummary;

  const lineupSummary = {
    headline: "Lineup ready",
    confidence: "medium",
    limitations: [],
    facts: [],
    decisions: [],
    lockedStarters: [],
    openSlots: [],
    swapRecommendations: [],
    riskyStarters: [],
    currentProjectedPoints: null,
    recommendedProjectedPoints: null,
    projectedPointDelta: null,
    currentProjectionCoverage: 0,
    recommendedProjectionCoverage: 0,
  } as unknown as TeamLineupSummary;

  const waiverSummary = {
    headline: "Waivers pending",
    candidates: [],
    dropCandidates: [],
    facts: [],
    limitations: [],
  } as unknown as TeamWaiverSummary;

  const activitySummary = {
    headline: "No recent activity",
    week: 1,
    recentTransactions: [],
    trendingAdds: [],
    trendingDrops: [],
    facts: [],
    limitations: [],
    updatedAt: "2026-08-12T12:00:00.000Z",
  } as unknown as TeamActivitySummary;

  return {
    state,
    dataReadiness,
    needs,
    lineupSummary,
    weekContext: null,
    waiverSummary,
    activitySummary,
    rosRankingSummary: null,
    weeklyProjectionSummary: null,
  };
}
