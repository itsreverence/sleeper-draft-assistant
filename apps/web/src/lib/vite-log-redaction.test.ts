import { describe, expect, it } from "vitest";

import { redactViteLogMessage } from "../../vite-log-redaction";

describe("Vite development log redaction", () => {
  it("redacts SSE capability tokens from proxy errors", () => {
    const message = "http proxy error: /drafts/mock/events?apiToken=secret-value&userRosterId=1";

    expect(redactViteLogMessage(message)).toBe(
      "http proxy error: /drafts/mock/events?apiToken=[redacted]&userRosterId=1",
    );
    expect(redactViteLogMessage(message)).not.toContain("secret-value");
  });
});

