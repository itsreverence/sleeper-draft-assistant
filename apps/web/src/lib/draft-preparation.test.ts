import { describe, expect, it } from "vitest";

import { shouldOpenDraftPreparation } from "./draft-preparation";

describe("draft preparation", () => {
  const now = new Date("2026-08-20T12:00:00.000Z").getTime();

  it("opens for a real active draft without current rankings", () => {
    expect(shouldOpenDraftPreparation("draft-1", "pre_draft", null, now)).toBe(true);
    expect(
      shouldOpenDraftPreparation("draft-1", "drafting", "2026-08-01T12:00:00.000Z", now),
    ).toBe(true);
  });

  it("bypasses preparation for current rankings, demos, and completed drafts", () => {
    expect(
      shouldOpenDraftPreparation("draft-1", "pre_draft", "2026-08-19T12:00:00.000Z", now),
    ).toBe(false);
    expect(shouldOpenDraftPreparation("mock-draft", "pre_draft", null, now)).toBe(false);
    expect(shouldOpenDraftPreparation("draft-1", "complete", null, now)).toBe(false);
  });
});
