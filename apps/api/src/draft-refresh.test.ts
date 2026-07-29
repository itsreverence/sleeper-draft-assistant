import { describe, expect, it } from "vitest";

import { draftPollDelayMs } from "./draft-refresh";

describe("draft polling backoff", () => {
  it("uses the normal cadence when Sleeper is healthy", () => {
    expect(draftPollDelayMs(0)).toBe(5_000);
  });

  it("backs off repeated failures and caps the delay", () => {
    expect(draftPollDelayMs(1)).toBe(5_000);
    expect(draftPollDelayMs(2)).toBe(10_000);
    expect(draftPollDelayMs(3)).toBe(20_000);
    expect(draftPollDelayMs(4)).toBe(30_000);
    expect(draftPollDelayMs(20)).toBe(30_000);
  });
});

