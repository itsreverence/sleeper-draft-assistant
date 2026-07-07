import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SettingsStore } from "./settings-store";

describe("SettingsStore", () => {
  it("persists AI provider settings", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-")), "settings.json");
    const firstStore = new SettingsStore(filePath);

    firstStore.update({
      aiProvider: "codex-app-server",
      codexBin: "codex-test",
      codexModel: "gpt-5.4-test",
      codexTimeoutMs: 45000,
    });

    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const secondStore = new SettingsStore(filePath);

    expect(raw.aiProvider).toBe("codex-app-server");
    expect(secondStore.get()).toMatchObject({
      aiProvider: "codex-app-server",
      codexBin: "codex-test",
      codexModel: "gpt-5.4-test",
      codexTimeoutMs: 45000,
    });
  });
});