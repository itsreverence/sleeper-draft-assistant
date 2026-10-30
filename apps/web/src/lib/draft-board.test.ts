import { describe, expect, it } from "vitest";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";

import { buildDraftBoardRows, pickNumberForDraftSlot, pickStripSummary, starterSlotSummary, visibleDraftRounds } from "./draft-board";

describe("draft board", () => {
  it("maps fixed draft slots to snake-order pick numbers", () => {
    expect(pickNumberForDraftSlot(1, 1, 10)).toBe(1);
    expect(pickNumberForDraftSlot(1, 10, 10)).toBe(10);
    expect(pickNumberForDraftSlot(2, 1, 10)).toBe(20);
    expect(pickNumberForDraftSlot(2, 10, 10)).toBe(11);
    expect(pickNumberForDraftSlot(3, 1, 10)).toBe(21);
  });

  it("shows the current and next round in the live view", () => {
    const mockState = createMockDraftState(8);
    const state = {
      ...mockState,
      settings: { ...mockState.settings, rounds: 16 },
      status: "drafting" as const,
      currentPick: 24,
    };

    expect(visibleDraftRounds(state, "live")).toEqual([3, 4]);
    expect(visibleDraftRounds(state, "full")).toHaveLength(16);
  });

  it("keeps two live rounds at either end of the draft", () => {
    const mockState = createMockDraftState(8);
    const settings = { ...mockState.settings, teams: 10, rounds: 15 };

    expect(visibleDraftRounds({ ...mockState, settings, status: "pre_draft", currentPick: 1 }, "live")).toEqual([1, 2]);
    expect(visibleDraftRounds({ ...mockState, settings, status: "drafting", currentPick: 145 }, "live")).toEqual([14, 15]);
    expect(visibleDraftRounds({ ...mockState, settings, status: "complete", currentPick: 3 }, "live")).toEqual([14, 15]);
    expect(visibleDraftRounds({ ...mockState, settings: { ...settings, rounds: 1 }, status: "drafting", currentPick: 3 }, "live")).toEqual([1]);
  });

  describe("pick strip", () => {
    const drafting = (currentPick: number) => {
      const state = createMockDraftState(8);
      return { ...state, status: "drafting" as const, currentPick };
    };

    it("puts the user on the clock with their following turn", () => {
      const state = drafting(1);
      const userTeamId = state.teams.find((team) => team.draftSlot === 1)!.id;
      expect(pickStripSummary({ ...state, userTeamId })).toEqual({
        tone: "clock",
        label: "You are on the clock",
        pick: { label: "Pick", slot: "1.01", overall: 1 },
        nextTurn: { label: "Next turn", slot: "2.10", overall: 2 * state.settings.teams },
        round: { number: 1, direction: "forward" },
      });
    });

    it("counts down to the user's next turn in a reversed round", () => {
      const state = drafting(createMockDraftState(8).settings.teams + 1);
      const userTeam = state.teams.find((team) => team.id === state.userTeamId)!;
      const summary = pickStripSummary(state);
      const userPickInRoundTwo = 2 * state.settings.teams - userTeam.draftSlot + 1;
      const away = userPickInRoundTwo - state.currentPick;
      expect(summary.tone).toBe("neutral");
      expect(summary.label).toBe(`${away} picks away`);
      expect(summary.nextTurn?.overall).toBe(userPickInRoundTwo);
      expect(summary.round).toEqual({ number: 2, direction: "reverse" });
    });

    it("does not call a pre-draft first pick on the clock", () => {
      const state = { ...drafting(1), status: "pre_draft" as const };
      const userTeamId = state.teams.find((team) => team.draftSlot === 1)!.id;
      const summary = pickStripSummary({ ...state, userTeamId });
      expect(summary.tone).toBe("neutral");
      expect(summary.label).toBe("Draft not started");
      expect(summary.pick?.label).toBe("First pick");
    });

    it("says so when the user has no picks left", () => {
      const state = drafting(3);
      const userTeamId = state.teams.find((team) => team.draftSlot === 1)!.id;
      const pickOrder = { source: "sleeper" as const, entries: [{ pickNo: state.currentPick, teamId: state.teams.find((team) => team.id !== userTeamId)!.id }] } as never;
      expect(pickStripSummary({ ...state, userTeamId, pickOrder }).label).toBe("No picks left");
    });

    it("drops timing and direction it cannot know", () => {
      const state = { ...drafting(3), pickOrder: { source: "unsupported" as const, entries: [] } };
      const summary = pickStripSummary(state);
      expect(summary.label).toBe("Pick timing unknown");
      expect(summary.nextTurn).toBeNull();
      expect(summary.round).toBeNull();
      expect(pickStripSummary({ ...state, status: "complete" })).toEqual({ tone: "neutral", label: "Draft complete", pick: null, nextTurn: null, round: null });
    });
  });

  describe("starter slot summary", () => {
    it("counts dedicated slots first and spills the rest into flex", () => {
      const state = createMockDraftState(0);
      const team = state.teams.find((entry) => entry.id === state.userTeamId)!;
      const ofPosition = (position: string, count: number) => state.players.filter((player) => player.position === position).slice(0, count).map((player) => player.id);
      const roster = [...ofPosition("RB", 3), ...ofPosition("WR", 1)];
      const summary = starterSlotSummary({
        ...state,
        settings: { ...state.settings, rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 5 } },
        teams: state.teams.map((entry) => entry.id === team.id ? { ...entry, roster } : entry),
      });

      expect(summary.total).toBe(9);
      expect(summary.filled).toBe(4);
      expect(summary.groups).toEqual([
        { label: "QB", filled: 0, total: 1 },
        { label: "RB", filled: 2, total: 2 },
        { label: "WR", filled: 1, total: 2 },
        { label: "TE", filled: 0, total: 1 },
        { label: "FLEX", filled: 1, total: 1 },
        { label: "K/DEF", filled: 0, total: 2 },
      ]);
    });

    it("omits groups the league does not start", () => {
      const state = createMockDraftState(0);
      const summary = starterSlotSummary({ ...state, settings: { ...state.settings, rosterSlots: { QB: 1, BN: 3 } } });
      expect(summary.groups).toEqual([{ label: "QB", filled: 0, total: 1 }]);
    });
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
