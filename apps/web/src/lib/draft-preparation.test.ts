import { describe, expect, it } from "vitest";

import { shouldOpenDraftPreparation } from "./draft-preparation";

describe("draft preparation", () => {
  const now = new Date("2026-08-20T12:00:00.000Z").getTime();

  it("opens for a real active draft without current rankings", () => {
    expect(shouldOpenDraftPreparation("draft-1", "pre_draft", null, true, now)).toBe(true);
    expect(
      shouldOpenDraftPreparation("draft-1", "drafting", "2026-08-01T12:00:00.000Z", true, now),
    ).toBe(true);
  });

  it("opens once for an unacknowledged AI choice", () => {
    expect(
      shouldOpenDraftPreparation("draft-1", "pre_draft", "2026-08-19T12:00:00.000Z", false, now),
    ).toBe(true);
  });

  it("bypasses preparation for acknowledged current rankings, demos, and completed drafts", () => {
    expect(
      shouldOpenDraftPreparation("draft-1", "pre_draft", "2026-08-19T12:00:00.000Z", true, now),
    ).toBe(false);
    expect(shouldOpenDraftPreparation("mock-draft", "pre_draft", null, false, now)).toBe(false);
    expect(shouldOpenDraftPreparation("draft-1", "complete", null, false, now)).toBe(false);
  });
});
