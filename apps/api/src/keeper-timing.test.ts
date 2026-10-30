import { describe, expect, it } from "vitest";
import { keeperCases, keeperInput } from "../../../tests/fixtures/keeper-drafts";
import { recentDraftPicks } from "@sleeper-draft-assistant/shared/draft-timing";
import { normalizeSleeperDraftState } from "./sleeper";
import { buildDraftStrategyContext } from "./ai/context";
import { createDraftPlayerSnapshot, createDraftStrategyTools } from "./ai/draft-tools";

const syntheticDraft = (made: number[], keepers: number[]) => ({ ...keeperCases[8]!, made, keepers }) as unknown as typeof keeperCases[number];

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

  it("does not read a missing pick_no as a one-round draft", () => {
    const input = keeperInput(syntheticDraft(Array.from({ length: 16 }, (_, index) => index + 1), []));
    input.draft.settings = { teams: 12 };
    input.picks = input.picks.map(({ pick_no: _pickNo, ...pick }) => pick) as typeof input.picks;
    expect(normalizeSleeperDraftState(input).settings.rounds).toBe(2);
  });

  it("keeps the strategist's remaining selections when turn timing is unsupported", () => {
    const input = keeperInput(syntheticDraft([], []));
    input.draft.type = "auction";
    const state = normalizeSleeperDraftState(input);
    expect(state.pickOrder?.source).toBe("unsupported");
    expect(buildDraftStrategyContext(state).draft.remainingUserSelections).toBe(3);
  });

  it("hides only future keepers from recent picks, not a real pick above a sync gap", () => {
    const input = keeperInput(syntheticDraft([1, 2, 4], [9]));
    const state = normalizeSleeperDraftState(input);
    expect(state.currentPick).toBe(3);
    expect(recentDraftPicks(state, 12).map((pick) => pick.pickNo)).toEqual([4, 2, 1]);
  });
});
