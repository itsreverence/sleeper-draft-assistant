import { z } from "zod";

export const PositionSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DEF"]);
export type Position = z.infer<typeof PositionSchema>;

export const PlayerSignalSourceSchema = z.enum(["mock", "sleeper_search_rank", "imported", "season_projection", "weekly_projection"]);
export type PlayerSignalSource = z.infer<typeof PlayerSignalSourceSchema>;

export const PlayerSchema = z.object({
  id: z.string(),
  sleeperId: z.string(),
  name: z.string(),
  team: z.string(),
  position: PositionSchema,
  projectedPoints: z.number(),
  projectionSource: PlayerSignalSourceSchema,
  adp: z.number().nullable(),
  tier: z.number().nullable(),
  riskTags: z.array(z.string()),
  importedRank: z.number().nullable().optional(),
  importedPositionRank: z.number().nullable().optional(),
  importedSource: z.string().nullable().optional(),
  byeWeek: z.number().nullable().optional(),
  ecrVsAdp: z.number().nullable().optional(),
  seasonProjectedPoints: z.number().nullable().optional(),
  seasonProjectionSource: z.string().nullable().optional(),
  seasonProjectionSeason: z.string().nullable().optional(),
  seasonProjectionCoverage: z.enum(["league_scored", "provider_approximation"]).nullable().optional(),
  adpSource: z.string().nullable().optional(),
  realTimeAdp: z.number().nullable().optional(),
  weeklyProjectedPoints: z.number().nullable().optional(),
  weeklyProjectionSource: z.string().nullable().optional(),
  weeklyProjectionSeason: z.string().nullable().optional(),
  weeklyProjectionWeek: z.number().nullable().optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const RankingImportSourceSchema = z.enum(["fantasypros"]);
export type RankingImportSource = z.infer<typeof RankingImportSourceSchema>;

export const DraftScoringFormatSchema = z.enum(["PPR", "Half PPR", "Standard", "Custom", "Unknown"]);
export type DraftScoringFormat = z.infer<typeof DraftScoringFormatSchema>;

export const RankingImportRequestSchema = z.object({
  source: RankingImportSourceSchema.default("fantasypros"),
  scoring: DraftScoringFormatSchema.default("Unknown"),
  csvText: z.string().min(1),
});
export type RankingImportRequest = z.infer<typeof RankingImportRequestSchema>;

export const AiProviderIdSchema = z.enum(["noop", "codex-app-server"]);
export type AiProviderId = z.infer<typeof AiProviderIdSchema>;

export function isCodexExecutableReference(value: string): boolean {
  const executableName = value.trim().split(/[\\/]/).pop()?.toLowerCase();
  return executableName === "codex" || executableName === "codex.exe" || executableName === "codex.cmd";
}

export const AppSettingsSchema = z.object({
  aiProvider: AiProviderIdSchema.default("noop"),
  codexBin: z.string().trim().min(1).max(4_096).refine(isCodexExecutableReference, {
    message: "Codex command must resolve to codex, codex.exe, or codex.cmd.",
  }).default("codex"),
  codexModel: z.string().trim().min(1).default("gpt-5.4"),
  codexTimeoutMs: z.number().int().min(5_000).max(300_000).default(60_000),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const AppSettingsUpdateSchema = AppSettingsSchema.partial();
export type AppSettingsUpdate = z.infer<typeof AppSettingsUpdateSchema>;

export const RankingImportSummarySchema = z.object({
  source: RankingImportSourceSchema,
  rowsParsed: z.number(),
  matched: z.number(),
  unmatched: z.array(
    z.object({
      row: z.number(),
      name: z.string(),
      team: z.string().nullable(),
      position: PositionSchema.nullable(),
    }),
  ),
  ambiguous: z.array(
    z.object({
      row: z.number(),
      name: z.string(),
      team: z.string().nullable(),
      position: PositionSchema.nullable(),
      candidates: z.array(z.string()),
    }),
  ),
  scoring: DraftScoringFormatSchema.optional(),
  appliedAt: z.string(),
});
export type RankingImportSummary = z.infer<typeof RankingImportSummarySchema>;

export const SeasonProjectionImportRequestSchema = z.object({
  source: z.literal("fantasypros").default("fantasypros"),
  season: z.string().trim().min(4),
  files: z.array(z.object({
    position: PositionSchema,
    csvText: z.string().min(1),
  })).min(1).max(6),
});
export type SeasonProjectionImportRequest = z.infer<typeof SeasonProjectionImportRequestSchema>;

export const SeasonProjectionImportSummarySchema = z.object({
  source: z.literal("fantasypros"),
  season: z.string(),
  scoring: z.string(),
  positions: z.array(PositionSchema),
  rowsParsed: z.number(),
  matched: z.number(),
  unmatched: z.array(z.object({
    row: z.number(),
    name: z.string(),
    team: z.string().nullable(),
    position: PositionSchema.nullable(),
  })),
  ambiguous: z.array(z.object({
    row: z.number(),
    name: z.string(),
    team: z.string().nullable(),
    position: PositionSchema.nullable(),
    candidates: z.array(z.string()),
  })),
  approximatePositions: z.array(PositionSchema),
  warnings: z.array(z.string()),
  appliedAt: z.string(),
});
export type SeasonProjectionImportSummary = z.infer<typeof SeasonProjectionImportSummarySchema>;

export const AdpImportRequestSchema = z.object({
  source: z.literal("fantasypros").default("fantasypros"),
  season: z.string().trim().min(4),
  csvText: z.string().min(1),
});
export type AdpImportRequest = z.infer<typeof AdpImportRequestSchema>;

export const AdpImportSummarySchema = z.object({
  source: z.literal("fantasypros"),
  market: z.literal("Sleeper"),
  season: z.string(),
  rowsParsed: z.number(),
  matched: z.number(),
  unmatched: z.array(z.object({
    row: z.number(),
    name: z.string(),
    team: z.string().nullable(),
    position: PositionSchema.nullable(),
  })),
  ambiguous: z.array(z.object({
    row: z.number(),
    name: z.string(),
    team: z.string().nullable(),
    position: PositionSchema.nullable(),
    candidates: z.array(z.string()),
  })),
  includesRealTime: z.boolean(),
  appliedAt: z.string(),
});
export type AdpImportSummary = z.infer<typeof AdpImportSummarySchema>;

export const WeeklyProjectionImportSourceSchema = z.enum(["fantasypros"]);
export type WeeklyProjectionImportSource = z.infer<typeof WeeklyProjectionImportSourceSchema>;

export const WeeklyProjectionImportRequestSchema = z.object({
  source: WeeklyProjectionImportSourceSchema.default("fantasypros"),
  season: z.string().trim().min(4),
  week: z.number().int().min(1).max(22),
  position: PositionSchema.nullable().optional(),
  csvText: z.string().min(1),
});
export type WeeklyProjectionImportRequest = z.infer<typeof WeeklyProjectionImportRequestSchema>;

export const WeeklyProjectionBatchImportRequestSchema = z.object({
  source: WeeklyProjectionImportSourceSchema.default("fantasypros"),
  season: z.string().trim().min(4),
  week: z.number().int().min(1).max(22),
  files: z.array(z.object({
    position: PositionSchema,
    csvText: z.string().min(1),
  })).min(1).max(6),
});
export type WeeklyProjectionBatchImportRequest = z.infer<typeof WeeklyProjectionBatchImportRequestSchema>;

export const WeeklyProjectionPositionResultSchema = z.object({
  position: PositionSchema,
  rowsParsed: z.number(),
  matched: z.number(),
  unmatched: z.number(),
  ambiguous: z.number(),
  appliedAt: z.string(),
});
export type WeeklyProjectionPositionResult = z.infer<typeof WeeklyProjectionPositionResultSchema>;

export const WeeklyProjectionImportSummarySchema = z.object({
  source: WeeklyProjectionImportSourceSchema,
  season: z.string(),
  week: z.number(),
  position: PositionSchema.nullable(),
  positions: z.array(PositionSchema),
  positionResults: z.array(WeeklyProjectionPositionResultSchema),
  rowsParsed: z.number(),
  matched: z.number(),
  unmatched: z.array(
    z.object({
      row: z.number(),
      name: z.string(),
      team: z.string().nullable(),
      position: PositionSchema.nullable(),
    }),
  ),
  ambiguous: z.array(
    z.object({
      row: z.number(),
      name: z.string(),
      team: z.string().nullable(),
      position: PositionSchema.nullable(),
      candidates: z.array(z.string()),
    }),
  ),
  appliedAt: z.string(),
});
export type WeeklyProjectionImportSummary = z.infer<typeof WeeklyProjectionImportSummarySchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  draftSlot: z.number(),
  roster: z.array(z.string()),
});
export type Team = z.infer<typeof TeamSchema>;

export const PickSchema = z.object({
  pickNo: z.number(),
  round: z.number(),
  draftSlot: z.number(),
  teamId: z.string(),
  playerId: z.string(),
});
export type Pick = z.infer<typeof PickSchema>;

export const DraftSettingsSchema = z.object({
  teams: z.number(),
  rounds: z.number(),
  scoring: z.string(),
  scoringSettings: z.record(z.string(), z.number()).optional(),
  rosterSlots: z.record(z.string(), z.number()),
});
export type DraftSettings = z.infer<typeof DraftSettingsSchema>;

export const DraftStateSchema = z.object({
  id: z.string(),
  leagueId: z.string().nullable().optional(),
  name: z.string(),
  status: z.enum(["pre_draft", "drafting", "complete"]),
  currentPick: z.number(),
  userTeamId: z.string(),
  settings: DraftSettingsSchema,
  teams: z.array(TeamSchema),
  players: z.array(PlayerSchema),
  picks: z.array(PickSchema),
  updatedAt: z.string(),
});
export type DraftState = z.infer<typeof DraftStateSchema>;


export const TeamRosterSlotSchema = z.object({
  slot: z.string(),
  eligiblePositions: z.array(z.string()),
  player: PlayerSchema.nullable(),
});
export type TeamRosterSlot = z.infer<typeof TeamRosterSlotSchema>;

export const TeamManagerStateSchema = z.object({
  league: z.object({
    id: z.string(),
    name: z.string(),
    season: z.string().nullable(),
    status: z.string(),
    teams: z.number(),
    scoring: z.string(),
    rosterSlots: z.record(z.string(), z.number()),
  }),
  userTeam: z.object({
    rosterId: z.string(),
    ownerId: z.string().nullable(),
    name: z.string(),
  }),
  roster: z.object({
    starters: z.array(TeamRosterSlotSchema),
    bench: z.array(PlayerSchema),
    injuredReserve: z.array(PlayerSchema),
    taxi: z.array(PlayerSchema),
    positionCounts: z.record(PositionSchema, z.number()),
  }),
  week: z.number().nullable(),
  updatedAt: z.string(),
  dataQuality: z.object({
    playerValueSource: z.string(),
    limitations: z.array(z.string()),
  }),
});
export type TeamManagerState = z.infer<typeof TeamManagerStateSchema>;

export const TeamPositionNeedSchema = z.object({
  position: PositionSchema,
  rostered: z.number(),
  requiredStarters: z.number(),
  benchDepth: z.number(),
  status: z.enum(["open_starter", "thin_depth", "covered", "surplus"]),
  priority: z.number(),
  reasons: z.array(z.string()),
});
export type TeamPositionNeed = z.infer<typeof TeamPositionNeedSchema>;

export const TeamLineupAssignmentSchema = z.object({
  slot: z.string(),
  eligiblePositions: z.array(z.string()),
  player: PlayerSchema.nullable(),
  reason: z.string(),
});
export type TeamLineupAssignment = z.infer<typeof TeamLineupAssignmentSchema>;

export const TeamNeedsSummarySchema = z.object({
  headline: z.string(),
  weakestPositions: z.array(PositionSchema),
  openStarterSlots: z.array(z.string()),
  thinPositions: z.array(PositionSchema),
  surplusPositions: z.array(PositionSchema),
  flexPressure: z.string(),
  lineup: z.array(TeamLineupAssignmentSchema),
  positionNeeds: z.array(TeamPositionNeedSchema),
  facts: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type TeamNeedsSummary = z.infer<typeof TeamNeedsSummarySchema>;
export const TeamLineupDecisionSchema = z.object({
  slot: z.string(),
  currentPlayer: PlayerSchema.nullable(),
  recommendedPlayer: PlayerSchema.nullable(),
  alternativePlayers: z.array(PlayerSchema),
  status: z.enum(["locked", "open", "swap_recommended", "thin"]),
  confidence: z.enum(["low", "medium", "high"]),
  currentProjectedPoints: z.number().nullable(),
  recommendedProjectedPoints: z.number().nullable(),
  projectedPointDelta: z.number().nullable(),
  reasons: z.array(z.string()),
});
export type TeamLineupDecision = z.infer<typeof TeamLineupDecisionSchema>;

export const TeamLineupSummarySchema = z.object({
  headline: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  decisions: z.array(TeamLineupDecisionSchema),
  lockedStarters: z.array(PlayerSchema),
  openSlots: z.array(z.string()),
  swapRecommendations: z.array(TeamLineupDecisionSchema),
  riskyStarters: z.array(PlayerSchema),
  currentProjectedPoints: z.number().nullable(),
  recommendedProjectedPoints: z.number().nullable(),
  projectedPointDelta: z.number().nullable(),
  currentProjectionCoverage: z.number().min(0).max(1),
  recommendedProjectionCoverage: z.number().min(0).max(1),
  facts: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type TeamLineupSummary = z.infer<typeof TeamLineupSummarySchema>;

export const TeamDataReadinessSchema = z.object({
  status: z.enum(["ready", "partial", "limited"]),
  confidence: z.enum(["low", "medium", "high"]),
  headline: z.string(),
  activeSeason: z.string().nullable(),
  activeWeek: z.number().nullable(),
  importedAt: z.string().nullable(),
  relevantPositions: z.array(PositionSchema),
  loadedPositions: z.array(PositionSchema),
  missingPositions: z.array(PositionSchema),
  importMatchRate: z.number().min(0).max(1).nullable(),
  rosterProjectionCoverage: z.number().min(0).max(1),
  projectedRosterPlayers: z.number().int().nonnegative(),
  eligibleRosterPlayers: z.number().int().nonnegative(),
  facts: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type TeamDataReadiness = z.infer<typeof TeamDataReadinessSchema>;
export const TeamWeekPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  team: z.string(),
  position: PositionSchema,
  slot: z.string().nullable(),
  points: z.number().nullable(),
});
export type TeamWeekPlayer = z.infer<typeof TeamWeekPlayerSchema>;

export const TeamWeekContextSchema = z.object({
  week: z.number(),
  matchupId: z.number().nullable(),
  status: z.enum(["scheduled", "in_progress", "final", "unknown"]),
  userRosterId: z.string(),
  opponentRosterId: z.string().nullable(),
  userTeamName: z.string(),
  opponentTeamName: z.string().nullable(),
  userPoints: z.number().nullable(),
  opponentPoints: z.number().nullable(),
  userStarters: z.array(TeamWeekPlayerSchema),
  opponentStarters: z.array(TeamWeekPlayerSchema),
  facts: z.array(z.string()),
  limitations: z.array(z.string()),
  updatedAt: z.string(),
});
export type TeamWeekContext = z.infer<typeof TeamWeekContextSchema>;
export const TeamWaiverCandidateSchema = z.object({
  player: PlayerSchema,
  score: z.number(),
  rosterFit: z.enum(["starter_need", "depth_need", "upgrade", "stash"]),
  valueLabel: z.string(),
  suggestedDrop: PlayerSchema.nullable(),
  reasons: z.array(z.string()),
});
export type TeamWaiverCandidate = z.infer<typeof TeamWaiverCandidateSchema>;

export const TeamDropCandidateSchema = z.object({
  player: PlayerSchema,
  score: z.number(),
  reasons: z.array(z.string()),
});
export type TeamDropCandidate = z.infer<typeof TeamDropCandidateSchema>;

export const TeamWaiverSummarySchema = z.object({
  headline: z.string(),
  candidates: z.array(TeamWaiverCandidateSchema),
  dropCandidates: z.array(TeamDropCandidateSchema),
  facts: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type TeamWaiverSummary = z.infer<typeof TeamWaiverSummarySchema>;
export const TeamActivityPlayerSchema = z.object({
  player: PlayerSchema,
  count: z.number().nullable(),
  direction: z.enum(["add", "drop"]),
});
export type TeamActivityPlayer = z.infer<typeof TeamActivityPlayerSchema>;

export const TeamTransactionItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  createdAt: z.string().nullable(),
  rosterIds: z.array(z.string()),
  addedPlayers: z.array(PlayerSchema),
  droppedPlayers: z.array(PlayerSchema),
  waiverBid: z.number().nullable(),
  description: z.string(),
});
export type TeamTransactionItem = z.infer<typeof TeamTransactionItemSchema>;

export const TeamActivitySummarySchema = z.object({
  headline: z.string(),
  week: z.number().nullable(),
  recentTransactions: z.array(TeamTransactionItemSchema),
  trendingAdds: z.array(TeamActivityPlayerSchema),
  trendingDrops: z.array(TeamActivityPlayerSchema),
  facts: z.array(z.string()),
  limitations: z.array(z.string()),
  updatedAt: z.string(),
});
export type TeamActivitySummary = z.infer<typeof TeamActivitySummarySchema>;
export const CandidateSignalSchema = z.object({
  player: PlayerSchema,
  score: z.number(),
  projectedEdge: z.number(),
  rosterFit: z.enum(["need", "depth", "luxury"]),
  valueLabel: z.string(),
  scarcityLabel: z.string(),
  returnProbability: z.number(),
  reasons: z.array(z.string()),
});
export type CandidateSignal = z.infer<typeof CandidateSignalSchema>;

export const DraftRecommendationSchema = z.object({
  headline: z.string(),
  recommendedPlayerId: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  candidates: z.array(CandidateSignalSchema),
  summary: z.string(),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export type DraftRecommendation = z.infer<typeof DraftRecommendationSchema>;

export const DraftEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    state: DraftStateSchema,
    recommendation: DraftRecommendationSchema,
  }),
  z.object({
    type: z.literal("pick"),
    pick: PickSchema,
    state: DraftStateSchema,
    recommendation: DraftRecommendationSchema,
  }),
  z.object({
    type: z.literal("heartbeat"),
    at: z.string(),
  }),
]);
export type DraftEvent = z.infer<typeof DraftEventSchema>;






