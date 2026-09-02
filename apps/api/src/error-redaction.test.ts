import { describe, expect, it } from "vitest";

import { CODEX_EXECUTABLE_REFERENCE_MESSAGE } from "@sleeper-draft-assistant/shared";

import { app, redactErrorMessage } from "./index";

describe("API public-release boundaries", () => {
  it("does not expose removed direct-backend routes or settings", async () => {
    const statusResponse = await app.request("/ai/direct-backend/status");
    const settingsResponse = await app.request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiProvider: "unsupported-provider" }),
    });

    expect(statusResponse.status).toBe(404);
    expect(settingsResponse.status).toBe(400);
  });

  it("explains an invalid Codex command without echoing the submitted value", async () => {
    const response = await app.request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codexBin: "private-invalid-command" }),
    });
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe(CODEX_EXECUTABLE_REFERENCE_MESSAGE);
    expect(payload.error).not.toContain("private-invalid-command");
  });

  it("redacts credentials and home-directory identities from logged messages", () => {
    const message = redactErrorMessage(
      "Bearer secret-token access_token=token-value refreshToken:other-value /home/private-user/data C:\\Users\\private-user\\data",
    );

    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("token-value");
    expect(message).not.toContain("other-value");
    expect(message).not.toContain("private-user");
    expect(message).toContain("[redacted]");
    expect(message).toContain("[home]");
  });
});
