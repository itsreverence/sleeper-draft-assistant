import { describe, expect, it } from "vitest";
import type { DraftState } from "./types";
import { draftSlotForPick, isUserOnTheClock, picksUntilUserTurn } from "./format";

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
