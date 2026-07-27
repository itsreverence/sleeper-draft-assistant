import { describe, expect, it } from "vitest";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";

import { buildDraftBoardRows, pickNumberForDraftSlot, visibleDraftRounds } from "./draft-board";

describe("draft board", () => {
  it("maps fixed draft slots to snake-order pick numbers", () => {
    expect(pickNumberForDraftSlot(1, 1, 10)).toBe(1);
    expect(pickNumberForDraftSlot(1, 10, 10)).toBe(10);
    expect(pickNumberForDraftSlot(2, 1, 10)).toBe(20);
    expect(pickNumberForDraftSlot(2, 10, 10)).toBe(11);
    expect(pickNumberForDraftSlot(3, 1, 10)).toBe(21);
  });

  it("keeps the live board focused around the current round", () => {
    const state = { ...createMockDraftState(8), status: "drafting" as const, currentPick: 24 };

    expect(visibleDraftRounds(state, "live")).toEqual([2, 3, 4, 5]);
    expect(visibleDraftRounds(state, "full")).toHaveLength(16);
  });

  it("places picks under their original slots while preserving traded ownership", () => {
    const state = createMockDraftState(2);
    const tradedPick = { ...state.picks[0], teamId: state.teams[4].id };
    const rows = buildDraftBoardRows({ ...state, picks: [tradedPick, state.picks[1]] }, [1]);
    const firstCell = rows[0].cells[0];

    expect(firstCell.pickNo).toBe(1);
    expect(firstCell.owner?.id).toBe(state.teams[4].id);
    expect(firstCell.isTraded).toBe(true);
  });

  it("marks the current cell and user-owned selections", () => {
    const state = createMockDraftState(8);
    const rows = buildDraftBoardRows(state, [1]);
    const currentCell = rows[0].cells.find((cell) => cell.pickNo === state.currentPick);
    const userPick = rows[0].cells.find((cell) => cell.pick?.teamId === state.userTeamId);

    expect(currentCell?.isCurrent).toBe(true);
    expect(userPick?.isUserPick).toBe(true);
  });
});
