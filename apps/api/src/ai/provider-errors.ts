export type AiProviderFailureCode =
  | "codex_not_found"
  | "codex_auth_required"
  | "codex_model_unavailable"
  | "codex_timeout"
  | "codex_start_failed"
  | "codex_request_failed";

export class AiProviderUnavailableError extends Error {
  constructor(
    readonly code: AiProviderFailureCode,
    readonly publicMessage: string,
    options?: ErrorOptions,
  ) {
    super(publicMessage, options);
    this.name = "AiProviderUnavailableError";
  }
}

export function toAiProviderUnavailableError(
  error: unknown,
  phase: "startup" | "request" = "request",
): AiProviderUnavailableError {
  if (error instanceof AiProviderUnavailableError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("could not locate the codex cli")
    || normalized.includes("configure its full path")
    || normalized.includes("enoent")
  ) {
    return new AiProviderUnavailableError(
      "codex_not_found",
      "Codex CLI was not found. Install or update Codex, then verify the command in Settings.",
      { cause: error },
    );
  }
  if (
    normalized.includes("not logged in")
    || normalized.includes("login required")
    || normalized.includes("authentication required")
    || normalized.includes("unauthorized")
  ) {
    return new AiProviderUnavailableError(
      "codex_auth_required",
      "Codex is not signed in. Run `codex login status`, sign in if needed, then retry.",
      { cause: error },
    );
  }
  if (normalized.includes("model") && (normalized.includes("not found") || normalized.includes("unavailable"))) {
    return new AiProviderUnavailableError(
      "codex_model_unavailable",
      "The selected Codex model is unavailable. Choose another model in Settings and retry.",
      { cause: error },
    );
  }
  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return new AiProviderUnavailableError(
      "codex_timeout",
      "Codex did not respond in time. Verify the CLI and login, then retry.",
      { cause: error },
    );
  }
  return phase === "startup"
    ? new AiProviderUnavailableError(
        "codex_start_failed",
        "Codex could not start. Update the Codex CLI, run `codex login status`, and check its configuration before retrying.",
        { cause: error },
      )
    : new AiProviderUnavailableError(
        "codex_request_failed",
        "Codex could not complete the request. Verify its login and selected model, then retry.",
        { cause: error },
      );
}
