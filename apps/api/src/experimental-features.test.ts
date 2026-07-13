import { describe, expect, it } from "vitest";

import { isExperimentalCodexBackendEnabled } from "./experimental-features";

describe("experimental provider release gate", () => {
  it("is disabled by default and requires an explicit exact opt-in", () => {
    expect(isExperimentalCodexBackendEnabled({})).toBe(false);
    expect(isExperimentalCodexBackendEnabled({ SLEEPER_AI_ENABLE_EXPERIMENTAL_CODEX_BACKEND: "true" })).toBe(false);
    expect(isExperimentalCodexBackendEnabled({ SLEEPER_AI_ENABLE_EXPERIMENTAL_CODEX_BACKEND: "1" })).toBe(true);
  });
});
