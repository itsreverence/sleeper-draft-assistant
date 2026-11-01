import { describe, expect, it } from "vitest";

import { draftPreparationHeading, nextDraftPreparationStep, remainingDraftPreparationSteps, shouldOpenDraftPreparation } from "./draft-preparation";

describe("next draft preparation step", () => {
  const ready = { hasRankings: true, rankingsStale: false, hasProjections: true, hasAdp: true, aiConfigured: true };

  it("walks the screen in order and ends at the draft room", () => {
    expect(nextDraftPreparationStep({ hasRankings: false, rankingsStale: false, hasProjections: false, hasAdp: false, aiConfigured: false })).toBe("rankings");
    expect(nextDraftPreparationStep({ ...ready, hasProjections: false, hasAdp: false, aiConfigured: false })).toBe("projections");
    expect(nextDraftPreparationStep({ ...ready, hasAdp: false, aiConfigured: false })).toBe("adp");
    expect(nextDraftPreparationStep({ ...ready, aiConfigured: false })).toBe("assistant");
    expect(nextDraftPreparationStep(ready)).toBeNull();
  });

  it("sends stale rankings back to the rankings import", () => {
    expect(nextDraftPreparationStep({ ...ready, rankingsStale: true })).toBe("rankings");
  });
});

describe("draft preparation heading", () => {
  const view = { draftComplete: false, assistantChecking: false, remaining: 0 };

  it.each([
    [4, "Four steps before the draft room"],
    [3, "Three steps before the draft room"],
    [2, "Two steps before the draft room"],
    [1, "One step before the draft room"],
    [0, "Ready for the draft room"],
  ])("counts %i steps left", (remaining, heading) => {
    expect(draftPreparationHeading({ ...view, remaining })).toBe(heading);
  });

  it("does not count steps while the Assistant's state is unknown", () => {
    expect(draftPreparationHeading({ ...view, assistantChecking: true, remaining: 1 })).toBe("Checking the Assistant");
  });

  it("does not promise a draft room ahead of a completed draft", () => {
    expect(draftPreparationHeading({ ...view, draftComplete: true, remaining: 3 })).toBe("Draft is over");
    expect(draftPreparationHeading({ ...view, draftComplete: true, assistantChecking: true })).toBe("Draft is over");
  });

  it("counts stale rankings as a step left", () => {
    const remaining = remainingDraftPreparationSteps({ hasRankings: true, rankingsStale: true, hasProjections: true, hasAdp: true, aiConfigured: true });
    expect(remaining).toEqual(["rankings"]);
  });
});

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
