import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { AiProviderManager } from "../ai/provider-factory";
import type { AiProvider } from "../ai/types";
import { SettingsStore } from "../settings-store";
import { LocalDataResetCoordinator } from "../local-data-reset";
import { registerSettingsRoutes } from "./settings-routes";

describe("saving web search settings", () => {
  it("closes the previous provider before responding, without waiting for a status request", async () => {
    const store = new SettingsStore(path.join(mkdtempSync(path.join(tmpdir(), "sda-settings-route-")), "settings.json"));
    store.update({ aiProvider: "codex-app-server" });
    const close = vi.fn();
    const factory = vi.fn(() => ({ close }) as unknown as AiProvider);
    const manager = new AiProviderManager(factory);
    manager.get(store.get());
    const app = new Hono();
    registerSettingsRoutes(app, {
      getSettingsStore: () => store,
      aiProviderManager: manager,
      localDataReset: new LocalDataResetCoordinator({} as never),
      handleRouteError: (c) => c.json({ error: "Invalid settings" }, 400),
    });
    const response = await app.request("/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codexWebSearch: false }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).codexWebSearch).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ codexWebSearch: false }));
  });
});
