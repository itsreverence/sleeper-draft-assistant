import { describe, expect, it } from "vitest";
import type { DraftState } from "./types";
import { draftSlotForPick, draftTeamReference, isUserOnTheClock, picksUntilUserTurn, preferredWorkspaceMode } from "./format";

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
