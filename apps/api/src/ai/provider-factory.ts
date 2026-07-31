import type { AppSettings } from "@sleeper-draft-assistant/shared";

import { CodexAppServerProvider } from "./codex-app-server-provider";
import { NoopAiProvider } from "./noop-provider";
import type { AiProvider } from "./types";

export function createAiProvider(settings: AppSettings): AiProvider {
  if (settings.aiProvider === "codex-app-server") {
    return new CodexAppServerProvider({
      codexBin: settings.codexBin,
      model: settings.codexModel,
      timeoutMs: settings.codexTimeoutMs,
    });
  }

  return new NoopAiProvider();
}

export class AiProviderManager {
  private provider: AiProvider | null = null;
  private settingsKey = "";

  constructor(
    private readonly factory: (settings: AppSettings) => AiProvider = createAiProvider,
  ) {}

  get(settings: AppSettings): AiProvider {
    const settingsKey = providerSettingsKey(settings);
    if (!this.provider || settingsKey !== this.settingsKey) {
      this.provider?.close?.();
      this.provider = this.factory(settings);
      this.settingsKey = settingsKey;
    }
    return this.provider;
  }

  close(): void {
    this.provider?.close?.();
    this.provider = null;
    this.settingsKey = "";
  }
}

function providerSettingsKey(settings: AppSettings): string {
  return JSON.stringify({
    aiProvider: settings.aiProvider,
    codexBin: settings.codexBin,
    codexModel: settings.codexModel,
    codexTimeoutMs: settings.codexTimeoutMs,
  });
}
