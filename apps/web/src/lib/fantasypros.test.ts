import { describe, expect, it } from "vitest";

import { buildFantasyProsWeeklyProjectionUrl } from "./fantasypros";

describe("FantasyPros weekly projection links", () => {
  it.each([
    ["PPR", "PPR"],
    ["Half PPR", "HALF"],
    ["Standard", "STD"],
  ] as const)("uses the %s scoring view for reception positions", (scoring, queryValue) => {
    const url = new URL(buildFantasyProsWeeklyProjectionUrl({ position: "WR", week: 1, scoring }));

    expect(url.pathname).toBe("/nfl/projections/wr.php");
    expect(url.searchParams.get("week")).toBe("1");
    expect(url.searchParams.get("scoring")).toBe(queryValue);
  });

  it("uses the FantasyPros DST route without an irrelevant reception scoring parameter", () => {
    const url = new URL(buildFantasyProsWeeklyProjectionUrl({ position: "DEF", week: 1, scoring: "PPR" }));

    expect(url.pathname).toBe("/nfl/projections/dst.php");
    expect(url.searchParams.get("week")).toBe("1");
    expect(url.searchParams.has("scoring")).toBe(false);
  });

  it("does not claim a scoring view for custom leagues", () => {
    const url = new URL(buildFantasyProsWeeklyProjectionUrl({ position: "RB", week: 2, scoring: "Custom" }));

    expect(url.searchParams.get("week")).toBe("2");
    expect(url.searchParams.has("scoring")).toBe(false);
  });
});
