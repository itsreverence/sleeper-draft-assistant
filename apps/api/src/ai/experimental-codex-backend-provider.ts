import type { AiAnswer, AiProvider, AiProviderStatus, DraftAiContext } from "./types";
import { buildDraftManagerInstructions, buildDraftManagerPrompt } from "./prompt";
import { ExperimentalCodexAuthClient, ExperimentalCodexTokenStore, type ExperimentalCodexTokenSet } from "./experimental-codex-auth";

export type ExperimentalCodexBackendProviderOptions = {
  model?: string;
  timeoutMs?: number;
  tokenStore: ExperimentalCodexTokenStore;
  authClient?: ExperimentalCodexAuthClient;
};

export class ExperimentalCodexBackendProvider implements AiProvider {
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly authClient: ExperimentalCodexAuthClient;

  constructor(private readonly options: ExperimentalCodexBackendProviderOptions) {
    this.model = options.model ?? "gpt-5.4";
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.authClient = options.authClient ?? new ExperimentalCodexAuthClient();
  }

  status(): AiProviderStatus {
    const authenticated = Boolean(this.options.tokenStore.get());
    return {
      id: "experimental-codex-backend",
      label: "Experimental Codex backend",
      configured: authenticated,
      experimental: true,
      detail: authenticated
        ? `Uses ChatGPT/Codex backend responses with model ${this.model}.`
        : "Sign in with Codex device auth before using this provider.",
    };
  }

  async answerDraftQuestion(context: DraftAiContext): Promise<AiAnswer> {
    const tokens = this.options.tokenStore.get();
    if (!tokens) {
      throw new Error("Experimental Codex backend is not authenticated. Open Settings and start Codex login.");
    }

    const answer = await this.generateWithRefresh(tokens, context);
    return {
      provider: this.status(),
      answer,
    };
  }

  private async generateWithRefresh(tokens: ExperimentalCodexTokenSet, context: DraftAiContext): Promise<string> {
    try {
      return await this.generate(tokens.accessToken, context);
    } catch (error) {
      if (!isAuthError(error)) {
        throw error;
      }

      const refreshed = await this.authClient.refresh(tokens);
      this.options.tokenStore.set(refreshed);
      return await this.generate(refreshed.accessToken, context);
    }
  }

  private async generate(accessToken: string, context: DraftAiContext): Promise<string> {
    const response = await fetch("https://chatgpt.com/backend-api/codex/responses", {
      method: "POST",
      headers: codexHeaders(accessToken),
      body: JSON.stringify({
        model: this.model,
        instructions: buildDraftManagerInstructions(),
        input: [
          {
            role: "user",
            content: buildDraftManagerPrompt(context),
          },
        ],
        store: false,
        stream: true,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const message = `Codex backend request failed with status ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`;
      if (response.status === 401 || detail.includes("token_invalidated")) {
        throw new ExperimentalCodexAuthenticationError(message);
      }
      throw new Error(message);
    }

    const text = await response.text();
    return extractStreamedOutputText(text) || "Codex completed without returning visible text.";
  }
}

export class ExperimentalCodexAuthenticationError extends Error {}

function codexHeaders(accessToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "User-Agent": "codex_cli_rs/0.0.0 (Sleeper AI Team Manager)",
    originator: "codex_cli_rs",
  };
  const accountId = chatgptAccountId(accessToken);
  if (accountId) {
    headers["ChatGPT-Account-ID"] = accountId;
  }
  return headers;
}

function chatgptAccountId(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(padBase64Url(parts[1]), "base64url").toString("utf8")) as Record<string, unknown>;
    const auth = payload["https://api.openai.com/auth"];
    if (!auth || typeof auth !== "object") {
      return null;
    }
    const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
    return typeof accountId === "string" && accountId ? accountId : null;
  } catch {
    return null;
  }
}

function padBase64Url(value: string): string {
  return value + "=".repeat((4 - (value.length % 4)) % 4);
}

export function extractStreamedOutputText(streamText: string): string {
  const deltaParts: string[] = [];
  const doneParts: string[] = [];

  for (const event of iterSseEvents(streamText)) {
    if (event.type === "error") {
      throw new Error(eventErrorDetail(event));
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      deltaParts.push(event.delta);
      continue;
    }
    if (event.type === "response.output_item.done" && event.item && typeof event.item === "object") {
      doneParts.push(extractOutputText({ output: [event.item] }));
    }
  }

  return (deltaParts.length > 0 ? deltaParts : doneParts).join("").trim();
}

function* iterSseEvents(streamText: string): Generator<Record<string, unknown>> {
  let eventName = "";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = "";
      return null;
    }
    const data = dataLines.join("\n");
    dataLines = [];
    const currentEvent = eventName;
    eventName = "";
    if (data === "[DONE]") {
      return null;
    }
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (currentEvent && !parsed.type) {
        parsed.type = currentEvent;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  for (const line of streamText.split(/\r?\n/)) {
    if (!line.trim()) {
      const payload = flush();
      if (payload) {
        yield payload;
      }
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  const payload = flush();
  if (payload) {
    yield payload;
  }
}

function extractOutputText(payload: { output?: unknown[] }): string {
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const entry of content) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const typed = entry as Record<string, unknown>;
      if (typed.type === "output_text" && typeof typed.text === "string") {
        parts.push(typed.text);
      }
    }
  }
  return parts.join("").trim();
}

function eventErrorDetail(event: Record<string, unknown>): string {
  const error = event.error ?? event.message ?? event.detail;
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message ?? (error as Record<string, unknown>).detail;
    if (typeof message === "string") {
      return message;
    }
  }
  return "Codex stream returned an error event.";
}

function isAuthError(error: unknown): boolean {
  return error instanceof ExperimentalCodexAuthenticationError;
}


