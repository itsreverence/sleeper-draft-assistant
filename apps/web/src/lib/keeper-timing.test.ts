import { describe, expect, it } from "vitest";
import { keeperCases, keeperInput } from "../../../../tests/fixtures/keeper-drafts";
import { normalizeSleeperDraftState } from "../../../api/src/sleeper";
import { upcomingUserPicks, picksUntilUserTurn, isUserOnTheClock } from "./format";
import { buildDraftBoardRows, currentDraftRound, nextPickForTeam, pickStripSummary } from "./draft-board";
import { recommendationTurnPresentation } from "./ai-panel";

describe("keeper board and turn presentation", () => {
  it("excludes own keepers in the legacy snake fallback", () => {
    const state = normalizeSleeperDraftState(keeperInput(keeperCases[4]!));
    delete state.pickOrder;
    expect(upcomingUserPicks(state)).toEqual([22, 27]);
    expect(picksUntilUserTurn(state)).toBe(20);
    expect(nextPickForTeam(state, state.userTeamId)).toBe(22);
  });
  it.each(keeperCases)("$name", (test) => {
    const state = normalizeSleeperDraftState(keeperInput(test));
    expect(upcomingUserPicks(state)).toEqual([test.next, test.following].filter((pick) => pick !== null));
    expect(nextPickForTeam(state, state.userTeamId)).toBe(test.next);
    expect(picksUntilUserTurn(state)).toBe(test.away);
    expect(isUserOnTheClock(state)).toBe(test.away === 0);
    expect(currentDraftRound(state)).toBe(Math.ceil(test.current / 12));
    const cells = buildDraftBoardRows(state, [1, 2, 3]).flatMap((row) => row.cells);
    expect(cells.filter((cell) => cell.isCurrent).map((cell) => cell.pickNo)).toEqual(test.next === null ? [] : [test.current]);
    const label = test.next === null ? "Draft complete" : test.away === 0 ? "On the clock" : `${test.away} picks away`;
    expect(pickStripSummary(state).label).toBe(label);
    const presentation = recommendationTurnPresentation(state, "Synthetic Target", "Draft Synthetic Target");
    if (test.away && test.away > 0) expect(presentation.timing).toContain(`${test.away} picks away`);
    if (test.away && test.between) expect(presentation.timing).toContain(`${test.between} between your picks`);
  });
});
