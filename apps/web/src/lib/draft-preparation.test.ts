import { describe, expect, it } from "vitest";

import { shouldOpenDraftPreparation } from "./draft-preparation";

describe("draft preparation", () => {
  const now = new Date("2026-08-20T12:00:00.000Z").getTime();
  const ready = {
    rankingsAppliedAt: "2026-08-19T12:00:00.000Z",
    hasProjections: true,
    hasAdp: true,
    aiReady: true,
  };

  it("opens for a real draft when any required input is missing or stale", () => {
    expect(shouldOpenDraftPreparation("draft-1", "pre_draft", { ...ready, rankingsAppliedAt: null }, now)).toBe(true);
    expect(
      shouldOpenDraftPreparation("draft-1", "drafting", { ...ready, rankingsAppliedAt: "2026-08-01T12:00:00.000Z" }, now),
    ).toBe(true);
    expect(shouldOpenDraftPreparation("draft-1", "pre_draft", { ...ready, hasProjections: false }, now)).toBe(true);
    expect(shouldOpenDraftPreparation("draft-1", "pre_draft", { ...ready, hasAdp: false }, now)).toBe(true);
    expect(shouldOpenDraftPreparation("draft-1", "pre_draft", { ...ready, aiReady: false }, now)).toBe(true);
  });

  it("bypasses preparation only for full readiness, demos, and completed drafts", () => {
    expect(shouldOpenDraftPreparation("draft-1", "pre_draft", ready, now)).toBe(false);
    expect(shouldOpenDraftPreparation("mock-draft", "pre_draft", { ...ready, rankingsAppliedAt: null }, now)).toBe(false);
    expect(shouldOpenDraftPreparation("draft-1", "complete", { ...ready, aiReady: false }, now)).toBe(false);
  });
});
