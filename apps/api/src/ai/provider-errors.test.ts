import { describe, expect, it } from "vitest";

import { toAiProviderUnavailableError } from "./provider-errors";

describe("AI provider error classification", () => {
  it("turns an app-server startup/configuration failure into safe guidance", () => {
    const error = toAiProviderUnavailableError(
      new Error("Error loading configuration: C:\\Users\\private-user\\.codex\\config.toml: unknown variant default"),
      "startup",
    );

    expect(error.code).toBe("codex_start_failed");
    expect(error.publicMessage).toContain("Update the Codex CLI");
    expect(error.publicMessage).toContain("codex login status");
    expect(error.publicMessage).not.toContain("private-user");
    expect(error.publicMessage).not.toContain("config.toml");
  });

  it("does not mislabel an unexpected turn failure as a startup failure", () => {
    const error = toAiProviderUnavailableError(new Error("Turn failed"), "request");
    expect(error.code).toBe("codex_request_failed");
    expect(error.publicMessage).toContain("could not complete the request");
    expect(error.publicMessage).not.toContain("could not start");
  });

  it("classifies missing CLI, authentication, model, and timeout failures", () => {
    expect(toAiProviderUnavailableError(new Error("Windows could not locate the Codex CLI")).code).toBe("codex_not_found");
    expect(toAiProviderUnavailableError(new Error("Login required")).code).toBe("codex_auth_required");
    expect(toAiProviderUnavailableError(new Error("Model unavailable")).code).toBe("codex_model_unavailable");
    expect(toAiProviderUnavailableError(new Error("Request timed out")).code).toBe("codex_timeout");
  });
});
