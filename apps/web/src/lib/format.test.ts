import { describe, expect, it } from "vitest";
import type { DraftState } from "./types";
import { draftSlotForPick, draftTeamReference, formatDraftPick, formatSleeperStatusSummary, formatSleeperStatusTitle, isUserOnTheClock, picksUntilUserTurn, preferredWorkspaceMode, upcomingUserPicks } from "./format";

describe("draft team identity", () => {
  it("prefers the draft-specific slot over the league roster ID", () => {
    expect(draftTeamReference({
      draftId: "draft-1",
      name: "Mock",
      status: "drafting",
      type: "snake",
      season: "2026",
      teams: 8,
      rounds: 15,
      userDraftSlot: 5,
    }, "1")).toBe("slot-5");
  });
});

describe("draft turn helpers", () => {
  it("computes snake draft slots", () => {
    expect(draftSlotForPick(1, 8)).toBe(1);
    expect(draftSlotForPick(8, 8)).toBe(8);
    expect(draftSlotForPick(9, 8)).toBe(8);
    expect(draftSlotForPick(16, 8)).toBe(1);
  });

  it("reports picks until the user is on the clock", () => {
    const state = createState({ currentPick: 3, userSlot: 1 });
    expect(picksUntilUserTurn(state)).toBe(13);
    expect(isUserOnTheClock(state)).toBe(false);
  });

  it("detects when the user is on the clock", () => {
    const state = createState({ currentPick: 1, userSlot: 1 });
    expect(picksUntilUserTurn(state)).toBe(0);
    expect(isUserOnTheClock(state)).toBe(true);
  });

  it("describes consecutive picks at the snake turn", () => {
    const state = createState({ currentPick: 1, userSlot: 8 });
    expect(upcomingUserPicks(state)).toEqual([8, 9]);
    expect(picksUntilUserTurn(state)).toBe(7);
    expect(formatDraftPick(8, 8)).toBe("1.08");
    expect(formatDraftPick(9, 8)).toBe("2.01");
  });

  it("uses explicit Sleeper ownership for traded picks", () => {
    const state = createState({ currentPick: 1, userSlot: 8 });
    state.pickOrder = {
      source: "sleeper",
      entries: [
        { pickNo: 4, round: 1, draftSlot: 4, teamId: state.userTeamId, originalTeamId: "team-4", isTraded: true },
        { pickNo: 9, round: 2, draftSlot: 8, teamId: state.userTeamId, originalTeamId: state.userTeamId, isTraded: false },
      ],
    };
    expect(upcomingUserPicks(state)).toEqual([4, 9]);
    expect(picksUntilUserTurn(state)).toBe(3);
  });
});

describe("preferredWorkspaceMode", () => {
  it("defaults to draft prep and live draft modes", () => {
    expect(preferredWorkspaceMode("pre_draft", true)).toBe("draft");
    expect(preferredWorkspaceMode("drafting", true)).toBe("draft");
    expect(preferredWorkspaceMode("complete", false)).toBe("draft");
  });

  it("defaults to season manager after the draft when available", () => {
    expect(preferredWorkspaceMode("complete", true)).toBe("manage");
  });
});

describe("Sleeper player status formatting", () => {
  const player = {
    id: "rb-1",
    sleeperId: "rb-1",
    name: "Running Back",
    team: "LV",
    position: "RB" as const,
    projectedPoints: 0,
    projectionSource: "sleeper_search_rank" as const,
    adp: null,
    tier: null,
    riskTags: [],
    sleeperStatus: {
      rosterStatus: "Active",
      injuryStatus: null,
      injuryStartDate: null,
      practiceParticipation: "Full Participation in Practice",
      depthChartPosition: "RB",
      depthChartOrder: 1,
      newsUpdatedAt: "2026-08-29T12:00:00.000Z",
    },
  };

  it("keeps routine depth and full-practice metadata out of the inline warning", () => {
    expect(formatSleeperStatusSummary(player)).toBeNull();
    expect(formatSleeperStatusTitle(player)).toContain("depth: RB1");
  });

  it("retains partial depth-chart metadata in hover details", () => {
    expect(formatSleeperStatusTitle({
      ...player,
      sleeperStatus: { ...player.sleeperStatus, depthChartOrder: null },
    })).toContain("depth: RB");
    expect(formatSleeperStatusTitle({
      ...player,
      sleeperStatus: { ...player.sleeperStatus, depthChartPosition: null },
    })).toContain("depth: #1");
  });

  it("keeps actionable injury and limited-practice status inline", () => {
    expect(formatSleeperStatusSummary({
      ...player,
      sleeperStatus: {
        ...player.sleeperStatus,
        injuryStatus: "Questionable",
        practiceParticipation: "Limited Participation in Practice",
      },
    })).toBe("Questionable · Limited");
  });
});

function createState({ currentPick, userSlot }: { currentPick: number; userSlot: number }): DraftState {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: `team-${index + 1}`,
    name: index + 1 === userSlot ? "Your Team" : `Team ${index + 1}`,
    draftSlot: index + 1,
    roster: [],
  }));

  return {
    id: "draft-1",
    name: "8-Team PPR",
    status: "drafting",
    currentPick,
    userTeamId: `team-${userSlot}`,
    settings: {
      teams: 8,
      rounds: 15,
      scoring: "PPR",
      rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, BN: 6 },
    },
    teams,
    players: [],
    picks: [],
    updatedAt: "2026-07-08T12:00:00.000Z",
  };
}
