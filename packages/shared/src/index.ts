import { z } from "zod";

export const PositionSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DEF"]);
export type Position = z.infer<typeof PositionSchema>;

export const PlayerSignalSourceSchema = z.enum(["mock", "sleeper_search_rank", "imported"]);
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
});
export type Player = z.infer<typeof PlayerSchema>;

export const RankingImportSourceSchema = z.enum(["fantasypros"]);
export type RankingImportSource = z.infer<typeof RankingImportSourceSchema>;

export const RankingImportRequestSchema = z.object({
  source: RankingImportSourceSchema.default("fantasypros"),
  csvText: z.string().min(1),
});
export type RankingImportRequest = z.infer<typeof RankingImportRequestSchema>;

export const AiProviderIdSchema = z.enum(["noop", "codex-app-server", "experimental-codex-backend"]);
export type AiProviderId = z.infer<typeof AiProviderIdSchema>;

export const AppSettingsSchema = z.object({
  aiProvider: AiProviderIdSchema.default("noop"),
  codexBin: z.string().trim().min(1).default("codex"),
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
  appliedAt: z.string(),
});
export type RankingImportSummary = z.infer<typeof RankingImportSummarySchema>;

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
  rosterSlots: z.record(z.string(), z.number()),
});
export type DraftSettings = z.infer<typeof DraftSettingsSchema>;

export const DraftStateSchema = z.object({
  id: z.string(),
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

