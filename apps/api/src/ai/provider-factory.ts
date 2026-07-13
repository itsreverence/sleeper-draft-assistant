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