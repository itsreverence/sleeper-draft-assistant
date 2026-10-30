import { describe, expect, it } from "vitest";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";

import type { DraftState } from "@sleeper-draft-assistant/shared";

import { buildDraftBoardRows, currentPickAnnouncement, nextPickForTeam, pickNumberForDraftSlot, pickStripSummary, roundDirection, starterSlotSummary, visibleDraftRounds } from "./draft-board";

type RoundOrder = (round: number) => "forward" | "reverse";
const linear: RoundOrder = () => "forward";
const snake: RoundOrder = (round) => round % 2 === 1 ? "forward" : "reverse";
const thirdRoundReversal: RoundOrder = (round) => round === 1 || round === 4 ? "forward" : "reverse";

function withOrder(order: RoundOrder, overrides: Partial<DraftState> = {}, trades: Record<number, string> = {}): DraftState {
  const mock = createMockDraftState(0);
  const state = { ...mock, settings: { ...mock.settings, rounds: 4 } };
  const teams = state.settings.teams;
  const entries = Array.from({ length: teams * state.settings.rounds }, (_, index) => {
    const pickNo = index + 1;
    const round = Math.ceil(pickNo / teams);
    const inRound = index % teams;
    const draftSlot = order(round) === "forward" ? inRound + 1 : teams - inRound;
    const originalTeamId = state.teams.find((team) => team.draftSlot === draftSlot)!.id;
    const teamId = trades[pickNo] ?? originalTeamId;
    return { pickNo, round, draftSlot, teamId, originalTeamId, isTraded: teamId !== originalTeamId };
  });
  return { ...state, status: "drafting", pickOrder: { source: "sleeper", entries }, ...overrides };
}

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

  describe("pick ownership", () => {
    const cellAt = (state: DraftState, pickNo: number) =>
      buildDraftBoardRows(state, Array.from({ length: state.settings.rounds }, (_, index) => index + 1))
        .flatMap((row) => row.cells)
        .find((cell) => cell.pickNo === pickNo)!;

    it("names the traded owner on an unpicked cell in every view", () => {
      const base = withOrder(snake);
      const pickNo = base.settings.teams * 2 + 4;
      const original = base.teams.find((team) => team.draftSlot === 4)!;
      const newOwner = base.teams.find((team) => team.draftSlot === 7)!;
      const state = withOrder(snake, { currentPick: pickNo }, { [pickNo]: newOwner.id });

      const cell = cellAt(state, pickNo);
      expect(cell.draftSlot).toBe(original.draftSlot);
      expect(cell.owner?.id).toBe(newOwner.id);
      expect(cell.isTraded).toBe(true);
      expect(cell.isCurrent).toBe(true);
      const liveCell = buildDraftBoardRows(state, visibleDraftRounds(state, "live")).flatMap((row) => row.cells).find((entry) => entry.pickNo === pickNo)!;
      expect(liveCell.owner?.id).toBe(newOwner.id);
    });

    it("moves a traded pick's user marking to the actual owner", () => {
      const base = withOrder(snake);
      const userSlot = base.teams.find((team) => team.id === base.userTeamId)!.draftSlot;
      const rival = base.teams.find((team) => team.id !== base.userTeamId)!;
      const gained = pickNumberForDraftSlot(2, rival.draftSlot, base.settings.teams);
      const lost = pickNumberForDraftSlot(3, userSlot, base.settings.teams);
      const state = withOrder(snake, {}, { [gained]: base.userTeamId, [lost]: rival.id });

      expect(cellAt(state, gained)).toMatchObject({ isUserOwned: true, isTraded: true });
      expect(cellAt(state, lost)).toMatchObject({ isUserOwned: false, isTraded: true });
      expect(nextPickForTeam({ ...state, currentPick: gained }, base.userTeamId)).toBe(gained);
    });

    it("does not mark an untraded cell", () => {
      const state = withOrder(snake);
      expect(cellAt(state, 3).isTraded).toBe(false);
    });

    it("falls back to the slot's team without a pick order", () => {
      const state = { ...createMockDraftState(0), status: "drafting" as const };
      expect(cellAt(state, 1).owner?.draftSlot).toBe(1);
      expect(cellAt(state, 1).isTraded).toBe(false);
    });

    it("has no pick on the clock before the draft starts or after it ends", () => {
      for (const status of ["pre_draft", "complete"] as const) {
        const state = withOrder(snake, { status, currentPick: 1 });
        const cells = buildDraftBoardRows(state, [1, 2]).flatMap((row) => row.cells);
        expect(cells.some((cell) => cell.isCurrent)).toBe(false);
      }
      expect(cellAt(withOrder(snake, { currentPick: 1 }), 1).isCurrent).toBe(true);
    });
  });

  describe("round order", () => {
    it.each([
      ["snake", snake, ["forward", "reverse", "forward", "reverse"]],
      ["linear", linear, ["forward", "forward", "forward", "forward"]],
      ["third-round reversal", thirdRoundReversal, ["forward", "reverse", "reverse", "forward"]],
    ] as const)("lays out a %s board from the pick order", (_name, order, directions) => {
      const state = withOrder(order);
      const rows = buildDraftBoardRows(state, [1, 2, 3, 4]);
      expect(rows.map((row) => row.direction)).toEqual(directions);
      const teams = state.settings.teams;
      rows.forEach((row, index) => {
        const firstInRound = row.cells.find((cell) => cell.pickNo === index * teams + 1)!;
        expect(firstInRound.draftSlot).toBe(row.direction === "forward" ? 1 : teams);
      });
    });

    it("points the strip the way a linear round runs and counts linear turns", () => {
      const base = withOrder(linear);
      const teams = base.settings.teams;
      const userTeamId = base.teams.find((team) => team.draftSlot === 1)!.id;
      const state = withOrder(linear, { userTeamId, currentPick: 2 * teams });
      const summary = pickStripSummary(state);
      expect(summary.label).toBe("1 pick away");
      expect(summary.facts[0]).toMatchObject({ label: "Your pick", overall: 2 * teams + 1 });
      expect(roundDirection(state, 2)).toBe("forward");
    });

    it("points the board through a third-round reversal", () => {
      expect(roundDirection(withOrder(thirdRoundReversal), 3)).toBe("reverse");
    });

    it("shows no board direction it cannot know", () => {
      const state = { ...createMockDraftState(0), pickOrder: { source: "unsupported" as const, entries: [] } };
      expect(buildDraftBoardRows(state, [1, 2]).map((row) => row.direction)).toEqual([null, null]);
      expect(nextPickForTeam(state, state.userTeamId)).toBeNull();
    });

    it("finds a team's next pick by owner in linear order", () => {
      const state = withOrder(linear);
      const team = state.teams.find((entry) => entry.draftSlot === 1)!;
      const teams = state.settings.teams;
      expect(nextPickForTeam({ ...state, currentPick: 2 }, team.id)).toBe(teams + 1);
    });
  });

  describe("current pick announcement", () => {
    it("names the owner, including a traded one", () => {
      const base = withOrder(snake);
      const rival = base.teams.find((team) => team.id !== base.userTeamId)!;
      const currentPick = base.teams.find((team) => team.id === rival.id)!.draftSlot === 1 ? 2 : 1;
      const state = withOrder(snake, { currentPick }, { [currentPick]: rival.id });
      expect(currentPickAnnouncement(state)).toBe(`Pick 1.${String(currentPick).padStart(2, "0")}. ${rival.name} is on the clock.`);
    });

    it("tells the user it is their turn", () => {
      const base = withOrder(snake);
      const currentPick = base.teams.find((team) => team.id === base.userTeamId)!.draftSlot;
      expect(currentPickAnnouncement({ ...base, currentPick })).toContain("You are on the clock");
    });

    it("stays quiet before the draft and reports its end", () => {
      expect(currentPickAnnouncement(withOrder(snake, { status: "pre_draft" }))).toBe("");
      expect(currentPickAnnouncement(withOrder(snake, { status: "complete" }))).toBe("Draft complete");
    });

    it("gives only the pick when ownership is unknown", () => {
      const state: DraftState = { ...createMockDraftState(0), status: "drafting", currentPick: 3, pickOrder: { source: "unsupported", entries: [] } };
      expect(currentPickAnnouncement(state)).toBe("Pick 1.03.");
    });
  });

  describe("pick strip", () => {
    const drafting = (currentPick: number) => {
      const state = createMockDraftState(currentPick - 1);
      return { ...state, status: "drafting" as const, currentPick };
    };

    it("puts the user on the clock with their following turn", () => {
      const state = drafting(1);
      const userTeamId = state.teams.find((team) => team.draftSlot === 1)!.id;
      expect(pickStripSummary({ ...state, userTeamId })).toEqual({
        tone: "clock",
        label: "On the clock",
        facts: [
          { label: "Pick", slot: "1.01", overall: 1 },
          { label: "next", slot: "2.10", overall: 2 * state.settings.teams },
        ],
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
      expect(summary.facts).toMatchObject([{ label: "Your pick", overall: userPickInRoundTwo }, { label: "Now", overall: state.currentPick }]);
    });

    it("does not call a pre-draft first pick on the clock", () => {
      const state = { ...drafting(1), status: "pre_draft" as const };
      const userTeamId = state.teams.find((team) => team.draftSlot === 1)!.id;
      const summary = pickStripSummary({ ...state, userTeamId });
      expect(summary.tone).toBe("neutral");
      expect(summary.label).toBe("Draft not started");
      expect(summary.facts[0]?.label).toBe("First pick");
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
      expect(summary.facts.map((fact) => fact.label)).toEqual(["Now"]);
      expect(roundDirection(state, 1)).toBeNull();
      expect(pickStripSummary({ ...state, status: "complete" })).toEqual({ tone: "neutral", label: "Draft complete", facts: [] });
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
