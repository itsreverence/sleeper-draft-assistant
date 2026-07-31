import type { AppSettings } from "@sleeper-draft-assistant/shared";

import type { DecisionSnapshot } from "./decision-log-store";
import type { SqliteAppDatabase } from "./sqlite-app-database";

export type StorageInventory = {
  location: "application-data" | "development-data";
  sqliteStorage: true;
  rankingImports: number;
  seasonProjectionImports: number;
  adpImports: number;
  rosRankingImports: number;
  weeklyProjectionImports: number;
  decisionSnapshots: number;
  draftPlans: number;
};

export function buildStorageInventory(database: SqliteAppDatabase): StorageInventory {
  return {
    location: process.env.SLEEPER_AI_DATA_DIR ? "application-data" : "development-data",
    sqliteStorage: true,
    rankingImports: database.countJson("ranking_imports"),
    seasonProjectionImports: database.countJson("season_projection_imports"),
    adpImports: database.countJson("adp_imports"),
    rosRankingImports: database.countJson("ros_ranking_imports"),
    weeklyProjectionImports: database.countJson("weekly_projection_imports"),
    decisionSnapshots: database.countDecisionSnapshots(),
    draftPlans: database.countJson("draft_plans"),
  };
}

export function buildRedactedSupportReport(input: {
  diagnostics: Record<string, unknown>;
  database: SqliteAppDatabase;
  settings: AppSettings;
}) {
  const snapshots = input.database.listAllDecisionSnapshots<DecisionSnapshot>();
  return {
    supportReportVersion: 1,
    generatedAt: new Date().toISOString(),
    diagnostics: input.diagnostics,
    provider: {
      id: input.settings.aiProvider,
      model: input.settings.codexModel,
      timeoutMs: input.settings.codexTimeoutMs,
    },
    decisionHistory: snapshots.map((snapshot) => ({
      createdAt: snapshot.createdAt,
      trigger: snapshot.trigger,
      status: snapshot.status,
      currentPick: snapshot.currentPick,
      picksMade: snapshot.picksMade,
      confidence: snapshot.confidence,
      candidateCount: snapshot.candidatePlayerIds.length,
      assumptionCount: snapshot.context.assumptions.length,
      riskCount: snapshot.context.risks.length,
    })),
  };
}
