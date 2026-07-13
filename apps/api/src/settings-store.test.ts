import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SettingsStore } from "./settings-store";
import { SqliteAppDatabase } from "./sqlite-app-database";

describe("SettingsStore", () => {
  it("persists AI provider settings", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-")), "settings.json");
    const codexBin = path.join(path.dirname(filePath), "codex");
    const firstStore = new SettingsStore(filePath);

    firstStore.update({
      aiProvider: "codex-app-server",
      codexBin,
      codexModel: "gpt-5.4-test",
      codexTimeoutMs: 45000,
    });

    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const secondStore = new SettingsStore(filePath);

    expect(raw.aiProvider).toBe("codex-app-server");
    expect(secondStore.get()).toMatchObject({
      aiProvider: "codex-app-server",
      codexBin,
      codexModel: "gpt-5.4-test",
      codexTimeoutMs: 45000,
    });
  });

  it("persists settings in SQLite", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-db-"));
    const dbPath = path.join(dir, "app.sqlite");
    const codexBin = path.join(dir, "codex.exe");
    const firstDatabase = await SqliteAppDatabase.open(dbPath);
    const firstStore = new SettingsStore(path.join(dir, "legacy-settings.json"), firstDatabase);

    firstStore.update({
      aiProvider: "codex-app-server",
      codexBin,
      codexModel: "gpt-db-test",
      codexTimeoutMs: 30000,
    });

    const secondDatabase = await SqliteAppDatabase.open(dbPath);
    const secondStore = new SettingsStore(path.join(dir, "legacy-settings.json"), secondDatabase);

    expect(secondStore.get()).toMatchObject({
      aiProvider: "codex-app-server",
      codexBin,
      codexModel: "gpt-db-test",
      codexTimeoutMs: 30000,
    });
  });

  it("rejects arbitrary subprocess commands", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-command-")), "settings.json");
    const store = new SettingsStore(filePath);

    expect(() => store.update({ codexBin: process.platform === "win32" ? "calc.exe" : "/bin/sh" })).toThrow(
      /Codex command/,
    );
  });
});
