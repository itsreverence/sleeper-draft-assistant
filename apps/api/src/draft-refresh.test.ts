import { describe, expect, it } from "vitest";

import { draftPollDelayMs } from "./draft-refresh";
import { draftStateRevision } from "@sleeper-draft-assistant/shared";
import { createMockDraftState } from "@sleeper-draft-assistant/engine";

describe("draft polling backoff", () => {
  it("invalidates a strategy for a corrected board but not a new check timestamp", () => {
    const state = createMockDraftState(8);
    expect(draftStateRevision({ ...state, updatedAt: "later" })).toBe(draftStateRevision(state));
    expect(draftStateRevision({ ...state, picks: [{ pickNo: 1, round: 1, draftSlot: 1,
      teamId: state.teams[0]!.id, playerId: "replacement" }] })).not.toBe(draftStateRevision(state));
    expect(draftStateRevision({ ...state, status: "complete" })).not.toBe(draftStateRevision(state));
  });
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
