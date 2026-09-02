import { Hono } from "hono";

import { buildRedactedSupportReport, buildStorageInventory } from "../data-management";
import type { DecisionLogStore } from "../decision-log-store";
import type { DraftPlanStore } from "../draft-plan-store";
import type { DraftStrategyInstructionStore } from "../draft-strategy-instruction-store";
import type { AdpImportStore, SeasonProjectionImportStore } from "../draft-value-import";
import type { LocalDataResetCoordinator } from "../local-data-reset";
import type { RankingImportStore } from "../rankings-import";
import type { SeasonValueRankingImportStore } from "../ros-rankings-import";
import type { SettingsStore } from "../settings-store";
import type { SqliteAppDatabase } from "../sqlite-app-database";
import type { WeeklyProjectionImportStore } from "../weekly-projections-import";
import type { RouteErrorHandler } from "./types";

type DataRouteDependencies = {
  database: SqliteAppDatabase;
  localDataReset: LocalDataResetCoordinator;
  createDiagnosticsPayload(): Record<string, unknown>;
  getSettingsStore(): SettingsStore;
  getRankingImportStore(): RankingImportStore;
  getSeasonProjectionImportStore(): SeasonProjectionImportStore;
  getAdpImportStore(): AdpImportStore;
  getSeasonValueRankingImportStore(): SeasonValueRankingImportStore;
  getWeeklyProjectionImportStore(): WeeklyProjectionImportStore;
  getDecisionLogStore(): DecisionLogStore;
  getDraftPlanStore(): DraftPlanStore;
  getDraftStrategyInstructionStore(): DraftStrategyInstructionStore;
  handleRouteError: RouteErrorHandler;
};

export function registerDataRoutes(app: Hono, dependencies: DataRouteDependencies): void {
  app.get("/data", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(buildStorageInventory(dependencies.database));
  });

  app.get("/data/support-report", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(
      buildRedactedSupportReport({
        diagnostics: dependencies.createDiagnosticsPayload(),
        database: dependencies.database,
        settings: dependencies.getSettingsStore().get(),
      }),
    );
  });

  app.delete("/data/:category", async (c) => {
    try {
      const category = c.req.param("category");
      const clearers: Record<string, () => number> = {
        rankings: () => dependencies.getRankingImportStore().clearAll(),
        "season-projections": () => dependencies.getSeasonProjectionImportStore().clearAll(),
        adp: () => dependencies.getAdpImportStore().clearAll(),
        "ros-rankings": () => dependencies.getSeasonValueRankingImportStore().clearAll(),
        "weekly-projections": () => dependencies.getWeeklyProjectionImportStore().clearAll(),
        "decision-history": () => dependencies.getDecisionLogStore().clearAll(),
        "draft-plans": () => dependencies.getDraftPlanStore().clearAll(),
        "strategy-instructions": () => dependencies.getDraftStrategyInstructionStore().clearAll(),
      };
      const clear = clearers[category];
      if (!clear) return c.json({ error: "Unknown local data category." }, 404);
      return c.json({ deleted: clear(), inventory: buildStorageInventory(dependencies.database) });
    } catch (error) {
      return dependencies.handleRouteError(c, error);
    }
  });

  app.post("/data/reset", async (c) => {
    try {
      const body = await c.req.json<{ confirmation?: string }>().catch(() => ({ confirmation: "" }));
      if (body.confirmation !== "DELETE ALL LOCAL DATA") {
        return c.json({ error: "Local data reset was not confirmed." }, 400);
      }

      const settings = dependencies.localDataReset.reset();
      return c.json({ settings, inventory: buildStorageInventory(dependencies.database) });
    } catch (error) {
      return dependencies.handleRouteError(c, error);
    }
  });
}
