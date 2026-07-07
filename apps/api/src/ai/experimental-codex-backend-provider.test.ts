import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ExperimentalCodexTokenStore } from "./experimental-codex-auth";
import { extractStreamedOutputText } from "./experimental-codex-backend-provider";

describe("experimental Codex backend helpers", () => {
  it("extracts streamed response text from SSE events", () => {
    const stream = [
      'event: response.output_text.delta',
      'data: {"delta":"Take "}',
      '',
      'event: response.output_text.delta',
      'data: {"delta":"Gibbs."}',
      '',
    ].join("\n");

    expect(extractStreamedOutputText(stream)).toBe("Take Gibbs.");
  });

  it("persists and clears backend token sets", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-ai-codex-tokens-")), "tokens.json");
    const store = new ExperimentalCodexTokenStore(filePath);

    store.set({ accessToken: "access", refreshToken: "refresh" });
    expect(new ExperimentalCodexTokenStore(filePath).get()).toEqual({ accessToken: "access", refreshToken: "refresh" });

    store.clear();
    expect(new ExperimentalCodexTokenStore(filePath).get()).toBeNull();
  });
});