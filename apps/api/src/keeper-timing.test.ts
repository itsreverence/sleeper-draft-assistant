import { describe, expect, it } from "vitest";
import { keeperCases, keeperInput } from "../../../tests/fixtures/keeper-drafts";
import { normalizeSleeperDraftState } from "./sleeper";
import { buildDraftStrategyContext } from "./ai/context";
import { createDraftPlayerSnapshot, createDraftStrategyTools } from "./ai/draft-tools";

describe("synthetic keeper timing", () => {
  it.each(keeperCases)("$name", async (test) => {
    const state = normalizeSleeperDraftState(keeperInput(test));
    expect(state.currentPick).toBe(test.current);
    expect(state.pickOrder?.source).toBe("sleeper");
    const context = buildDraftStrategyContext(state);
    expect(context.draft).toMatchObject({
      currentPick: test.current, nextUserPick: test.next, followingUserPick: test.following,
      picksUntilNextUserPick: test.away, picksBetweenUserTurns: test.between,
      remainingUserSelections: test.remaining,
    });
    expect(context.board.recentPicks.every((pick) => state.status === "complete" || pick.pickNo < test.current)).toBe(true);
    if (test.name === "two round-one keepers") {
      expect(context.board.recentPicks).toEqual([]);
      expect(context.board.teamsSelectingBeforeNextTurn.map((team) => team.draftSlot)).toEqual([1, 2]);
    }
    const market = createDraftStrategyTools(createDraftPlayerSnapshot(state, { pinned: [], faded: [], excluded: [] })).find((tool) => tool.definition.name === "inspect_position_market")!;
    const nextTurn = test.away === 0 ? test.following : test.next;
    const result = await market.execute({ positions: ["WR"] });
    expect(result).toMatchObject({ basedOnPick: test.current, userNextPick: nextTurn, picksUntilNextUserTurn: test.marketAway });
    if (test.name === "keepers plus traded pick") expect(result).toMatchObject({ teamsSelectingBeforeNextTurn: [] });
  });

  it("keeper slot metadata does not make timing unsupported", () => {
    const input = keeperInput(keeperCases[0]!);
    input.picks[0]!.draft_slot = 1;
    expect(normalizeSleeperDraftState(input).pickOrder?.source).toBe("sleeper");
  });

  it("infers missing rounds from real overall numbers", () => {
    const input = keeperInput(keeperCases[1]!);
    input.draft.settings = { teams: 12 };
    expect(normalizeSleeperDraftState(input).settings.rounds).toBe(3);
  });
});
