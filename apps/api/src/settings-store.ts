import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AppSettingsSchema, AppSettingsUpdateSchema, type AppSettings, type AppSettingsUpdate } from "@sleeper-draft-assistant/shared";

import type { SqliteAppDatabase } from "./sqlite-app-database";
import { readPrivateTextFile, writePrivateFile } from "./secure-file";

export class SettingsStore {
  private settings: AppSettings;

  constructor(private readonly filePath = getDefaultSettingsPath(), private readonly database?: SqliteAppDatabase) {
    this.settings = this.load();
  }

  get(): AppSettings {
    return this.settings;
  }

  update(input: unknown): AppSettings {
    const update = AppSettingsUpdateSchema.parse(input) satisfies AppSettingsUpdate;
    this.settings = AppSettingsSchema.parse({
      ...this.settings,
      ...update,
    });
    this.save();
    return this.settings;
  }

  private load(): AppSettings {
    const defaults = getDefaultSettings();
    const storedSettings = this.database?.getJson<unknown>("settings", "app");
    if (storedSettings) {
      return AppSettingsSchema.parse({
        ...defaults,
        ...(typeof storedSettings === "object" && storedSettings !== null ? storedSettings : {}),
      });
    }

    if (!existsSync(this.filePath)) {
      this.database?.setJson("settings", "app", defaults);
      return defaults;
    }

    try {
      const parsed = JSON.parse(readPrivateTextFile(this.filePath)) as unknown;
      const settings = AppSettingsSchema.parse({
        ...defaults,
        ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
      });
      this.database?.setJson("settings", "app", settings);
      return settings;
    } catch {
      this.database?.setJson("settings", "app", defaults);
      return defaults;
    }
  }

  private save() {
    if (this.database) {
      this.database.setJson("settings", "app", this.settings);
      return;
    }

    writePrivateFile(this.filePath, `${JSON.stringify(this.settings, null, 2)}\n`);
  }
}

function getDefaultSettings(): AppSettings {
  return AppSettingsSchema.parse({
    aiProvider: process.env.SLEEPER_AI_PROVIDER,
    codexBin: process.env.CODEX_BIN,
    codexModel: process.env.SLEEPER_AI_CODEX_MODEL,
    codexTimeoutMs: process.env.SLEEPER_AI_CODEX_TIMEOUT_MS
      ? Number(process.env.SLEEPER_AI_CODEX_TIMEOUT_MS)
      : undefined,
  });
}

function getDefaultSettingsPath(): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "app-settings.json")
    : path.join(repoRoot, "data", "app-settings.json");
}
