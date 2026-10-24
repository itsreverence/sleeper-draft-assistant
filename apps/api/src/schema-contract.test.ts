import { describe, expect, it } from "vitest";
import {
  AiDraftDecisionSchema,
  AppSettingsUpdateSchema,
  DraftStrategyInstructionSchema,
  NewsSourceSchema,
  TeamManagerStateSchema,
} from "@sleeper-draft-assistant/shared";

describe("shared validation contracts", () => {
  it("keeps settings updates partial and strips unknown fields", () => {
    expect(AppSettingsUpdateSchema.parse({})).toEqual({});
    expect(AppSettingsUpdateSchema.parse({ codexModel: "  custom-model  ", ignored: true }))
      .toEqual({ codexModel: "custom-model" });
    expect(AppSettingsUpdateSchema.parse({ codexWebSearch: undefined }))
      .toEqual({ codexWebSearch: undefined });
  });

  it("accepts sparse position counts and rejects unknown positions or nonnumeric counts", () => {
    const input = {
      league: { id: "league", name: "Test", season: "2026", status: "in_season", teams: 12, scoring: "PPR", rosterSlots: {} },
      userTeam: { rosterId: "1", ownerId: null, name: "Test team" },
      roster: { starters: [], bench: [], injuredReserve: [], taxi: [], positionCounts: { QB: 1 } },
      seasonPhase: "regular", week: 1, updatedAt: "2026-10-23T12:00:00Z",
      dataQuality: { playerValueSource: "test", limitations: [] },
    };
    expect(TeamManagerStateSchema.parse(input)).toEqual(input);
    for (const positionCounts of [{ IDP: 1 }, { QB: "1" }]) {
      expect(TeamManagerStateSchema.safeParse({ ...input, roster: { ...input.roster, positionCounts } }).success).toBe(false);
    }
  });

  it.each(["2026-10-23T12:00Z", "2026-10-23T12:00:00Z", "2024-02-29T12:00:00.123456Z"])(
    "preserves accepted UTC timestamp %s",
    (checkedAt) => {
      const source = { title: "Practice report", url: "https://www.nfl.com/news/test", reportedAt: null, checkedAt };
      expect(NewsSourceSchema.parse(source)).toEqual(source);
    },
  );

  it.each(["2026-02-29T12:00Z", "2026-10-23T24:00:00Z", "2026-10-23T12:00:00+01:00", "2026-10-23T12:00"])(
    "rejects invalid or non-UTC timestamp %s",
    (checkedAt) => {
      expect(NewsSourceSchema.safeParse({ title: "Practice report", url: "https://www.nfl.com/news/test", reportedAt: null, checkedAt }).success).toBe(false);
    },
  );

  it("accepts integer stored pick numbers and rejects fractions", () => {
    const instruction = { id: "instruction", text: "Draft WR depth", scope: "draft", source: "manual", createdAtPick: 12, createdAt: "2026-10-23T12:00Z" };
    expect(DraftStrategyInstructionSchema.parse(instruction)).toEqual(instruction);
    expect(DraftStrategyInstructionSchema.safeParse({ ...instruction, createdAtPick: 1.5 }).success).toBe(false);
  });

  it("fills optional AI collections and rejects an incomplete strategy", () => {
    const decision = {
      basedOnPick: 1, recommendedPlayerId: "player", verdict: "reasonable", confidence: "medium",
      headline: "Draft WR depth", summary: "Fill the WR slot.", reasons: ["An open starter slot remains."],
      plan: { updatedAtPick: 1, approach: "Fill the lineup", rosterGoals: ["Fill WR"], changeSummary: "First pick" },
    };
    expect(AiDraftDecisionSchema.parse(decision)).toEqual({
      ...decision, alternativePlayerIds: [], risks: [],
      plan: { ...decision.plan, currentPickFocus: [], nextTurnPriorities: [], positionsThatCanWait: [], watchItems: [] },
    });
    expect(AiDraftDecisionSchema.safeParse({ ...decision, plan: {} }).success).toBe(false);
  });
});
