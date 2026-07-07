import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AppSettingsSchema, AppSettingsUpdateSchema, type AppSettings, type AppSettingsUpdate } from "@sleeper-ai/shared";

export class SettingsStore {
  private settings: AppSettings;

  constructor(private readonly filePath = getDefaultSettingsPath()) {
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
    if (!existsSync(this.filePath)) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      return AppSettingsSchema.parse({
        ...defaults,
        ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
      });
    } catch {
      return defaults;
    }
  }

  private save() {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(this.settings, null, 2)}\n`, "utf8");
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