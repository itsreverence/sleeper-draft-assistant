import { AppSettingsSchema } from "@sleeper-draft-assistant/shared";
import { describe, expect, it, vi } from "vitest";

import { AiProviderManager } from "./provider-factory";
import type { AiProvider } from "./types";

describe("AiProviderManager", () => {
  it("reuses a provider until its provider settings change", () => {
    const close = vi.fn();
    const factory = vi.fn(() => ({ close }) as unknown as AiProvider);
    const manager = new AiProviderManager(factory);
    const settings = AppSettingsSchema.parse({
      aiProvider: "codex-app-server",
      codexBin: "codex",
      codexModel: "gpt-5.4",
      codexTimeoutMs: 60000,
    });

    const first = manager.get(settings);
    expect(manager.get({ ...settings, aiSetupAcknowledged: true })).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);

    const second = manager.get({ ...settings, codexModel: "gpt-test" });
    expect(second).not.toBe(first);
    expect(close).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(2);

    manager.close();
    expect(close).toHaveBeenCalledTimes(2);
  });
});
