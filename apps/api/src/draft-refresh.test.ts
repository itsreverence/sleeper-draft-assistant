import { describe, expect, it } from "vitest";

import { draftPollDelayMs } from "./draft-refresh";

describe("draft polling backoff", () => {
  it("polls active drafts quickly and idle states less often", () => {
    expect(draftPollDelayMs(0, "drafting")).toBe(2_000);
    expect(draftPollDelayMs(0, "pre_draft")).toBe(5_000);
    expect(draftPollDelayMs(0, "complete")).toBe(15_000);
  });

  it("backs off repeated failures and caps the delay", () => {
    expect(draftPollDelayMs(1)).toBe(5_000);
    expect(draftPollDelayMs(2)).toBe(10_000);
    expect(draftPollDelayMs(3)).toBe(20_000);
    expect(draftPollDelayMs(4)).toBe(30_000);
    expect(draftPollDelayMs(20)).toBe(30_000);
  });
});
