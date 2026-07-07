import type { AppSettings } from "@sleeper-ai/shared";

import { CodexAppServerProvider } from "./codex-app-server-provider";
import { ExperimentalCodexBackendProvider } from "./experimental-codex-backend-provider";
import { ExperimentalCodexTokenStore } from "./experimental-codex-auth";
import { NoopAiProvider } from "./noop-provider";
import type { AiProvider } from "./types";

export function createAiProvider(settings: AppSettings, experimentalTokenStore = new ExperimentalCodexTokenStore()): AiProvider {
  if (settings.aiProvider === "codex-app-server") {
    return new CodexAppServerProvider({
      codexBin: settings.codexBin,
      model: settings.codexModel,
      timeoutMs: settings.codexTimeoutMs,
    });
  }

  if (settings.aiProvider === "experimental-codex-backend") {
    return new ExperimentalCodexBackendProvider({
      model: settings.codexModel,
      timeoutMs: settings.codexTimeoutMs,
      tokenStore: experimentalTokenStore,
    });
  }

  return new NoopAiProvider();
}