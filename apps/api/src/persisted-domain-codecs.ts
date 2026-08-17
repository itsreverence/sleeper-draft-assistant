import {
  AdpImportSummarySchema,
  AiDraftDecisionSchema,
  AiDraftPlanSchema,
  AiProviderIdSchema,
  DraftRecommendationSchema,
  DraftStrategyInstructionSchema,
  RankingImportSummarySchema,
  RosRankingImportSummarySchema,
  SeasonProjectionImportSummarySchema,
  WeeklyProjectionImportSummarySchema,
} from "@sleeper-draft-assistant/shared";
import { z } from "zod";

import { createPersistedRecordCodec } from "./persisted-record";

const nullableNumber = z.number().nullable();
const playerEntries = <T extends z.ZodTypeAny>(valueSchema: T) => z.array(z.tuple([z.string(), valueSchema]));

export const SerializedRankingImportSchema = z.object({
  summary: RankingImportSummarySchema,
  players: playerEntries(z.object({
    rank: z.number(),
    tier: nullableNumber,
    positionRank: nullableNumber,
    byeWeek: nullableNumber,
    ecrVsAdp: nullableNumber,
    sosSeasonStars: nullableNumber,
  })),
});
export type SerializedRankingImport = z.infer<typeof SerializedRankingImportSchema>;

export const SerializedSeasonProjectionImportSchema = z.object({
  summary: SeasonProjectionImportSummarySchema,
  players: playerEntries(z.object({
    points: z.number(),
    coverage: z.enum(["league_scored", "provider_approximation"]),
  })),
});
export type SerializedSeasonProjectionImport = z.infer<typeof SerializedSeasonProjectionImportSchema>;

export const SerializedAdpImportSchema = z.object({
  summary: AdpImportSummarySchema,
  players: playerEntries(z.object({
    sleeperAdp: z.number(),
    realTimeAdp: nullableNumber,
  })),
});
export type SerializedAdpImport = z.infer<typeof SerializedAdpImportSchema>;

export const SerializedRosRankingImportSchema = z.object({
  summary: RosRankingImportSummarySchema,
  players: playerEntries(z.object({
    rank: z.number(),
    positionRank: nullableNumber,
    bestRank: nullableNumber,
    worstRank: nullableNumber,
    averageRank: nullableNumber,
    standardDeviation: nullableNumber,
  })),
});
export type SerializedRosRankingImport = z.infer<typeof SerializedRosRankingImportSchema>;

export const SerializedWeeklyProjectionImportSchema = z.object({
  summary: WeeklyProjectionImportSummarySchema,
  players: playerEntries(z.object({
    projectedPoints: z.number(),
    position: z.enum(["QB", "RB", "WR", "TE", "K", "DEF"]),
    positionRank: nullableNumber,
    stats: z.record(z.number()),
  })),
});
export type SerializedWeeklyProjectionImport = z.infer<typeof SerializedWeeklyProjectionImportSchema>;

export const StoredDraftPlanSchema = z.object({
  providerId: AiProviderIdSchema,
  plan: AiDraftPlanSchema,
});
export type StoredDraftPlan = z.infer<typeof StoredDraftPlanSchema>;

export const DraftStrategyInstructionsSchema = z.array(DraftStrategyInstructionSchema);

export const DecisionSnapshotSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  leagueId: z.string().nullable(),
  userRosterId: z.string().nullable(),
  trigger: z.enum([
    "state-load",
    "rankings-import",
    "rankings-clear",
    "manual-refresh",
    "ai-question",
    "ai-strategy",
    "candidate-evaluation",
    "pick-update",
  ]),
  createdAt: z.string(),
  draftName: z.string(),
  status: z.enum(["pre_draft", "drafting", "complete"]),
  currentPick: z.number(),
  picksMade: z.number(),
  userTeamId: z.string(),
  userTeamName: z.string().nullable(),
  recommendedPlayerId: z.string().nullable(),
  headline: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  aiStrategy: AiDraftDecisionSchema.optional(),
  candidatePlayerIds: z.array(z.string()),
  recommendation: DraftRecommendationSchema,
  context: z.object({
    topCandidates: z.array(z.object({
      playerId: z.string(),
      name: z.string(),
      position: z.string(),
      team: z.string(),
      orderLabel: z.string().optional(),
      evidence: z.array(z.string()).optional(),
      score: z.number().optional(),
      reasons: z.array(z.string()).optional(),
    })),
    assumptions: z.array(z.string()),
    risks: z.array(z.string()),
  }),
});
export type DecodedDecisionSnapshot = z.infer<typeof DecisionSnapshotSchema>;

export const rankingImportRecordCodec = createPersistedRecordCodec({
  domain: "ranking imports",
  version: 1,
  decodeData: (value) => SerializedRankingImportSchema.parse(value),
});
export const seasonProjectionImportRecordCodec = createPersistedRecordCodec({
  domain: "season projection imports",
  version: 1,
  decodeData: (value) => SerializedSeasonProjectionImportSchema.parse(value),
});
export const adpImportRecordCodec = createPersistedRecordCodec({
  domain: "ADP imports",
  version: 1,
  decodeData: (value) => SerializedAdpImportSchema.parse(value),
});
export const rosRankingImportRecordCodec = createPersistedRecordCodec({
  domain: "rest-of-season ranking imports",
  version: 1,
  decodeData: (value) => SerializedRosRankingImportSchema.parse(value),
});
export const weeklyProjectionImportRecordCodec = createPersistedRecordCodec({
  domain: "weekly projection imports",
  version: 1,
  decodeData: (value) => SerializedWeeklyProjectionImportSchema.parse(value),
});
export const draftPlanRecordCodec = createPersistedRecordCodec({
  domain: "draft plans",
  version: 1,
  decodeData: (value) => StoredDraftPlanSchema.parse(value),
});
export const draftStrategyInstructionsRecordCodec = createPersistedRecordCodec({
  domain: "draft strategy instructions",
  version: 1,
  decodeData: (value) => DraftStrategyInstructionsSchema.parse(value),
});
export const decisionSnapshotRecordCodec = createPersistedRecordCodec({
  domain: "decision history",
  version: 1,
  decodeData: (value) => DecisionSnapshotSchema.parse(value),
});
