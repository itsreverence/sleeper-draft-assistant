import { Hono } from "hono";

import type { AiProviderManager } from "../ai/provider-factory";
import type { SettingsStore } from "../settings-store";
import type { RouteErrorHandler } from "./types";

type SettingsRouteDependencies = {
  aiProviderManager: AiProviderManager;
  getSettingsStore(): SettingsStore;
  handleRouteError: RouteErrorHandler;
};

export function registerSettingsRoutes(app: Hono, dependencies: SettingsRouteDependencies): void {
  app.get("/settings", (c) => c.json(dependencies.getSettingsStore().get()));

  app.put("/settings", async (c) => {
    try {
      const input = await c.req.json<Record<string, unknown>>();
      return c.json(dependencies.getSettingsStore().update(input));
    } catch (error) {
      return dependencies.handleRouteError(c, error);
    }
  });

  app.get("/ai/status", async (c) => {
    const settings = dependencies.getSettingsStore().get();
    const provider = dependencies.aiProviderManager.get(settings);
    return c.json(provider.checkStatus ? await provider.checkStatus() : provider.status());
  });
}
