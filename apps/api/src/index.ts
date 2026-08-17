import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";

import type { AppSettings } from "@sleeper-draft-assistant/shared";

import { DecisionLogStore } from "./decision-log-store";
import { DraftPlanStore } from "./draft-plan-store";
import { DraftStrategyInstructionStore } from "./draft-strategy-instruction-store";
import { AiProviderManager } from "./ai/provider-factory";
import { RankingImportStore } from "./rankings-import";
import { AdpImportStore, SeasonProjectionImportStore } from "./draft-value-import";
import { RosRankingImportStore } from "./ros-rankings-import";
import { WeeklyProjectionImportStore } from "./weekly-projections-import";
import { SleeperApiError, SleeperClient } from "./sleeper";
import { SettingsStore } from "./settings-store";
import { SqliteAppDatabase } from "./sqlite-app-database";
import { requireApiToken } from "./api-auth";
import { parseApiPort } from "./config";
import { LocalDataResetCoordinator } from "./local-data-reset";
import { registerDataRoutes } from "./routes/data-routes";
import { registerSettingsRoutes } from "./routes/settings-routes";
import { registerSystemRoutes } from "./routes/system-routes";
import { registerConnectionRoutes } from "./routes/connection-routes";
import { createDraftRoutes } from "./routes/draft-routes";
import { registerTeamRoutes } from "./routes/team-routes";

export const app = new Hono();
const port = parseApiPort(process.env.PORT);
const hostname = "127.0.0.1";
const apiToken = process.env.SLEEPER_AI_API_TOKEN?.trim() || null;
const sleeperClient = new SleeperClient();
const appDatabase = await SqliteAppDatabase.open();
const aiProviderManager = new AiProviderManager();
let rankingImportStore: RankingImportStore;
let seasonProjectionImportStore: SeasonProjectionImportStore;
let adpImportStore: AdpImportStore;
let rosRankingImportStore: RosRankingImportStore;
let weeklyProjectionImportStore: WeeklyProjectionImportStore;
let decisionLogStore: DecisionLogStore;
let draftPlanStore: DraftPlanStore;
let draftStrategyInstructionStore: DraftStrategyInstructionStore;
let settingsStore: SettingsStore;
restoreDataStores();
const localDataReset = new LocalDataResetCoordinator({
  database: appDatabase,
  getResetTargets: () => ({
    clearers: [
      () => rankingImportStore.clearAll(),
      () => seasonProjectionImportStore.clearAll(),
      () => adpImportStore.clearAll(),
      () => rosRankingImportStore.clearAll(),
      () => weeklyProjectionImportStore.clearAll(),
      () => decisionLogStore.clearAll(),
      () => draftPlanStore.clearAll(),
      () => draftStrategyInstructionStore.clearAll(),
    ],
    settingsStore,
  }),
  restoreStores: restoreDataStores,
  closeActiveProvider: () => aiProviderManager.close(),
});
function restoreDataStores(): void {
  rankingImportStore = new RankingImportStore(undefined, appDatabase);
  seasonProjectionImportStore = new SeasonProjectionImportStore(undefined, appDatabase);
  adpImportStore = new AdpImportStore(undefined, appDatabase);
  rosRankingImportStore = new RosRankingImportStore(undefined, appDatabase);
  weeklyProjectionImportStore = new WeeklyProjectionImportStore(undefined, appDatabase);
  decisionLogStore = new DecisionLogStore(undefined, 200, appDatabase);
  draftPlanStore = new DraftPlanStore(appDatabase);
  draftStrategyInstructionStore = new DraftStrategyInstructionStore(appDatabase);
  settingsStore = new SettingsStore(undefined, appDatabase);
}

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
  requireApiToken(apiToken, {
    allowUnauthenticated:
      process.env.NODE_ENV === "test" && process.env.SLEEPER_AI_TEST_ENFORCE_AUTH !== "1",
  }),
);

app.get("/health", (c) => c.json(createHealthPayload()));

registerSystemRoutes(app, { createDiagnosticsPayload });

registerDataRoutes(app, {
  database: appDatabase,
  localDataReset,
  createDiagnosticsPayload,
  getSettingsStore: () => settingsStore,
  getRankingImportStore: () => rankingImportStore,
  getSeasonProjectionImportStore: () => seasonProjectionImportStore,
  getAdpImportStore: () => adpImportStore,
  getRosRankingImportStore: () => rosRankingImportStore,
  getWeeklyProjectionImportStore: () => weeklyProjectionImportStore,
  getDecisionLogStore: () => decisionLogStore,
  getDraftPlanStore: () => draftPlanStore,
  getDraftStrategyInstructionStore: () => draftStrategyInstructionStore,
  handleRouteError,
});
registerSettingsRoutes(app, {
  aiProviderManager,
  getSettingsStore: () => settingsStore,
  handleRouteError,
});

const draftRoutes = createDraftRoutes({
  sleeperClient,
  aiProviderManager,
  appDatabase,
  localDataReset,
  getSettingsStore: () => settingsStore,
  getRankingImportStore: () => rankingImportStore,
  getSeasonProjectionImportStore: () => seasonProjectionImportStore,
  getAdpImportStore: () => adpImportStore,
  getDecisionLogStore: () => decisionLogStore,
  getDraftPlanStore: () => draftPlanStore,
  getDraftStrategyInstructionStore: () => draftStrategyInstructionStore,
  handleRouteError,
  logRouteErrorMessage,
});
draftRoutes.registerGuidanceRoutes(app);

registerConnectionRoutes(app, { sleeperClient, handleRouteError });

registerTeamRoutes(app, {
  sleeperClient,
  aiProviderManager,
  getSettingsStore: () => settingsStore,
  getRankingImportStore: () => rankingImportStore,
  getSeasonProjectionImportStore: () => seasonProjectionImportStore,
  getAdpImportStore: () => adpImportStore,
  getRosRankingImportStore: () => rosRankingImportStore,
  getWeeklyProjectionImportStore: () => weeklyProjectionImportStore,
  handleRouteError,
});
draftRoutes.registerWorkspaceRoutes(app);

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
    codexServiceTier: settings.codexServiceTier,
    codexTimeoutMs: settings.codexTimeoutMs,
  };
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


function logRouteErrorMessage(context: string, error: unknown) {
  const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
  console.error(`[api] ${context} failed: ${message}`);
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
