import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
      codexServiceTier: "fast",
      codexTimeoutMs: 45000,
      aiSetupAcknowledged: true,
    });

    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const secondStore = new SettingsStore(filePath);

    expect(raw.aiProvider).toBe("codex-app-server");
    expect(secondStore.get()).toMatchObject({
      aiProvider: "codex-app-server",
      codexBin,
      codexModel: "gpt-5.4-test",
      codexServiceTier: "fast",
      codexTimeoutMs: 45000,
      aiSetupAcknowledged: true,
    });
  });

  it("enables fast Codex responses by default", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-defaults-")), "settings.json");

    expect(new SettingsStore(filePath).get().codexServiceTier).toBe("fast");
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

  it("migrates removed provider settings and deletes legacy tokens", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-migration-"));
    const filePath = path.join(dir, "app-settings.json");
    const tokenPath = path.join(dir, "experimental-codex-tokens.json");
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    database.setJson("settings", "app", {
      aiProvider: "experimental-codex-backend",
      codexBin: "codex",
      codexModel: "legacy-model",
      codexTimeoutMs: 60000,
    });
    writeFileSync(tokenPath, '{"accessToken":"legacy","refreshToken":"legacy"}\n', { mode: 0o600 });

    const store = new SettingsStore(filePath, database);

    expect(store.get().aiProvider).toBe("noop");
    expect(database.getJson<{ aiProvider: string }>("settings", "app")?.aiProvider).toBe("noop");
    expect(existsSync(tokenPath)).toBe(false);
  });

  it("migrates a legacy JSON settings file in place", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-json-migration-"));
    const filePath = path.join(dir, "app-settings.json");
    writeFileSync(filePath, JSON.stringify({
      aiProvider: "experimental-codex-backend",
      codexBin: "codex",
      codexModel: "legacy-model",
      codexTimeoutMs: 60000,
    }), { mode: 0o600 });

    const store = new SettingsStore(filePath);
    const migrated = JSON.parse(readFileSync(filePath, "utf8")) as { aiProvider: string };

    expect(store.get().aiProvider).toBe("noop");
    expect(migrated.aiProvider).toBe("noop");
  });

  it("updates the unconfirmed former default model without replacing an intentional model choice", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-model-migration-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    database.setJson("settings", "app", {
      aiProvider: "noop",
      codexBin: "codex",
      codexModel: "gpt-5.4",
      codexTimeoutMs: 60000,
      aiSetupAcknowledged: false,
    });

    const migratedStore = new SettingsStore(path.join(dir, "settings.json"), database);
    expect(migratedStore.get().codexModel).toBe("gpt-5.6-terra");

    migratedStore.update({
      aiProvider: "codex-app-server",
      codexModel: "gpt-5.4",
      aiSetupAcknowledged: true,
    });
    const reopenedStore = new SettingsStore(path.join(dir, "settings.json"), database);
    expect(reopenedStore.get().codexModel).toBe("gpt-5.4");
  });

  it("rejects arbitrary subprocess commands", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-settings-command-")), "settings.json");
    const store = new SettingsStore(filePath);

    expect(() => store.update({ codexBin: process.platform === "win32" ? "calc.exe" : "/bin/sh" })).toThrow(
      /Codex command/,
    );
  });
});
