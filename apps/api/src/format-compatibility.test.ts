import { describe, expect, it } from "vitest";

import { assessFormatCompatibility } from "./format-compatibility";

const baseSlots = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, BN: 6 };

describe("league format compatibility", () => {
  it.each(["PPR", "Half PPR", "Standard"])("supports conventional %s redraft leagues", (scoring) => {
    expect(assessFormatCompatibility({ scoring, rosterSlots: baseSlots })).toEqual({
      level: "supported",
      features: [],
      warnings: [],
    });
  });

  it("recognizes superflex without lowering support", () => {
    const result = assessFormatCompatibility({
      scoring: "Half PPR",
      rosterSlots: { ...baseSlots, SUPER_FLEX: 1 },
      draftType: "snake",
    });

    expect(result.level).toBe("supported");
    expect(result.features).toContain("superflex");
  });

  it("warns for custom and TE-premium scoring", () => {
    const result = assessFormatCompatibility({
      scoring: "Custom",
      scoringSettings: { rec: 0.75, bonus_rec_te: 0.5 },
      rosterSlots: baseSlots,
    });

    expect(result.level).toBe("caution");
    expect(result.features).toEqual(expect.arrayContaining(["custom_scoring", "te_premium"]));
    expect(result.warnings.join(" ")).toContain("TE-premium");
  });

  it.each([
    [{ ...baseSlots, LB: 2, DB: 2 }, "snake", "idp"],
    [baseSlots, "auction", "auction"],
  ] as const)("marks unsupported formats", (rosterSlots, draftType, feature) => {
    const result = assessFormatCompatibility({ scoring: "PPR", rosterSlots, draftType });

    expect(result.level).toBe("unsupported");
    expect(result.features).toContain(feature);
  });
});
