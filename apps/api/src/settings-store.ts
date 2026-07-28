import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AppSettingsSchema, AppSettingsUpdateSchema, type AppSettings, type AppSettingsUpdate } from "@sleeper-draft-assistant/shared";

import type { SqliteAppDatabase } from "./sqlite-app-database";
import { readPrivateTextFile, removePrivateFile, writePrivateFile } from "./secure-file";

const LEGACY_DIRECT_PROVIDER_ID = "experimental-codex-backend";
const LEGACY_DIRECT_PROVIDER_TOKEN_FILE = "experimental-codex-tokens.json";

export class SettingsStore {
  private settings: AppSettings;

  constructor(private readonly filePath = getDefaultSettingsPath(), private readonly database?: SqliteAppDatabase) {
    removeLegacyProviderTokenFile(path.dirname(this.filePath));
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

  reset(): AppSettings {
    this.settings = getDefaultSettings();
    removePrivateFile(this.filePath);
    this.save();
    return this.settings;
  }

  private load(): AppSettings {
    const defaults = getDefaultSettings();
    const storedSettings = this.database?.getJson<unknown>("settings", "app");
    if (storedSettings) {
      const migrated = migrateLegacyProviderSettings(storedSettings);
      const settings = AppSettingsSchema.parse({
        ...defaults,
        ...(typeof migrated.value === "object" && migrated.value !== null ? migrated.value : {}),
      });
      if (migrated.changed) {
        this.database?.setJson("settings", "app", settings);
      }
      return settings;
    }

    if (!existsSync(this.filePath)) {
      this.database?.setJson("settings", "app", defaults);
      return defaults;
    }

    try {
      const parsed = JSON.parse(readPrivateTextFile(this.filePath)) as unknown;
      const migrated = migrateLegacyProviderSettings(parsed);
      const settings = AppSettingsSchema.parse({
        ...defaults,
        ...(typeof migrated.value === "object" && migrated.value !== null ? migrated.value : {}),
      });
      if (migrated.changed) {
        writePrivateFile(this.filePath, `${JSON.stringify(settings, null, 2)}\n`);
      }
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

function migrateLegacyProviderSettings(input: unknown): { value: unknown; changed: boolean } {
  if (typeof input !== "object" || input === null || !("aiProvider" in input)) {
    return { value: input, changed: false };
  }

  const settings = input as Record<string, unknown>;
  return settings.aiProvider === LEGACY_DIRECT_PROVIDER_ID
    ? { value: { ...settings, aiProvider: "noop" }, changed: true }
    : { value: input, changed: false };
}

function removeLegacyProviderTokenFile(dataDirectory: string): void {
  try {
    removePrivateFile(path.join(dataDirectory, LEGACY_DIRECT_PROVIDER_TOKEN_FILE));
  } catch {
    // Cleanup must not block startup. Symlinked or otherwise unsafe paths remain untouched.
  }
}

function getDefaultSettingsPath(): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "app-settings.json")
    : path.join(repoRoot, "data", "app-settings.json");
}
