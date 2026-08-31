import { describe, expect, it } from "vitest";

import { getImportFreshness, getOldestImportAppliedAt } from "./freshness";

describe("import freshness", () => {
  const now = new Date("2026-08-20T12:00:00.000Z").getTime();

  it("labels current and aging imports", () => {
    expect(getImportFreshness("2026-08-20T08:00:00.000Z", 7, now)).toEqual({
      ageDays: 0,
      label: "updated today",
      stale: false,
    });
    expect(getImportFreshness("2026-08-19T08:00:00.000Z", 7, now).label).toBe("1 day old");
  });

  it("flags imports at the configured age threshold", () => {
    expect(getImportFreshness("2026-08-13T12:00:00.000Z", 7, now).stale).toBe(true);
    expect(getImportFreshness("invalid", 7, now)).toMatchObject({
      label: "date unknown",
      stale: true,
    });
  });

  it("uses the oldest position file when a batch was refreshed incrementally", () => {
    expect(getOldestImportAppliedAt([
      "2026-08-20T08:00:00.000Z",
      "2026-08-18T08:00:00.000Z",
      "2026-08-19T08:00:00.000Z",
    ], "2026-08-20T09:00:00.000Z")).toBe("2026-08-18T08:00:00.000Z");
  });
});
