import { createMockDraftState, isDraftChoiceRosterFeasible } from "@sleeper-draft-assistant/engine";
import { draftStateRevision } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { shouldRequestAiDraftStrategy } from "./ai-panel";
import {
  callAnnouncement,
  carriedTakenOptions,
  contingencyLabel,
  decisionReasonLine,
  draftRoomMode,
  recentPickPositions,
  shortlistFacts,
  shortlistReason,
  shortlistView,
  type StrategyCall,
} from "./draft-room";
import { picksUntilUserTurn } from "./format";
import type { AiDraftDecision, AiDraftStrategyPayload, DraftOption, DraftState } from "./types";

const provider = { id: "codex-app-server", label: "Codex", configured: true, availability: "available" } as const;

function onClockState(): DraftState {
  const state = createMockDraftState(8);
  return { ...state, userTeamId: state.teams.find((team) => team.draftSlot === state.currentPick)!.id };
}

function availableOptions(state: DraftState): DraftOption[] {
  const taken = new Set(state.picks.map((pick) => pick.playerId));
  return state.players.filter((player) => !taken.has(player.id)).slice(0, 4).map((player) => ({
    player, rosterFit: "need", evidence: [], orderSource: "ecr", orderLabel: "ECR", requiredToCompleteLineup: true,
  }));
}

function decision(overrides: Partial<AiDraftDecision> = {}): AiDraftDecision {
  return {
    basedOnPick: 9, recommendedPlayerId: "", alternativePlayerIds: [], verdict: "strong", confidence: "high", headline: "Take",
    summary: "A short summary.", reasons: ["Reason"], risks: [],
    plan: { updatedAtPick: 9, approach: "Plan", currentPickFocus: [], nextTurnPriorities: [], positionsThatCanWait: [], rosterGoals: ["Goal"], watchItems: [], changeSummary: "Note" },
    ...overrides,
  };
}

function call(state: DraftState, carried: DraftOption[] = []): StrategyCall {
  const [recommended, ...alternatives] = availableOptions(state);
  const payload: AiDraftStrategyPayload = {
    provider, pickNumber: state.currentPick, decision: decision({ recommendedPlayerId: recommended!.player.id }),
    recommendedCandidate: recommended!, alternativeCandidates: alternatives,
  };
  return { draftId: "draft", revision: draftStateRevision(state), payload, carried };
}

function afterPick(state: DraftState, playerId: string, teamId?: string): DraftState {
  const owner = teamId ?? state.teams.find((team) => team.id !== state.userTeamId)!.id;
  return {
    ...state,
    currentPick: state.currentPick + 1,
    picks: [...state.picks, { pickNo: state.currentPick, round: 1, draftSlot: 1, teamId: owner, playerId }],
  };
}

describe("draftRoomMode", () => {
  it("names each live mode from the turn distance", () => {
    const state = onClockState();
    expect(draftRoomMode(state, false)).toBe("on-clock");
    const slotAt = (pickNo: number) => state.teams.find((team) => team.draftSlot === pickNo)!.id;
    expect(draftRoomMode({ ...state, userTeamId: slotAt(10) }, false)).toBe("approaching");
    expect(draftRoomMode({ ...state, userTeamId: slotAt(1) }, false)).toBe("waiting");
  });

  it("uses the same threshold as automatic analysis", () => {
    const base = createMockDraftState(0);
    const status = { ...provider };
    for (let currentPick = 1; currentPick <= base.settings.teams * 2; currentPick += 1) {
      const state = { ...base, status: "drafting" as const, currentPick };
      const away = picksUntilUserTurn(state);
      const near = shouldRequestAiDraftStrategy(state, status, away);
      expect(draftRoomMode(state, false) !== "waiting", `pick ${currentPick}`).toBe(near);
    }
  });

  it("waits when pick timing is unknown or no picks remain", () => {
    const state = onClockState();
    expect(draftRoomMode({ ...state, pickOrder: { source: "unsupported", entries: [] } }, false)).toBe("waiting");
    const userless = { ...state, userTeamId: "not-a-team" };
    expect(draftRoomMode(userless, false)).toBe("waiting");
  });

  it("leads pre_draft with the shortlist and never calls it on the clock", () => {
    const state = { ...onClockState(), status: "pre_draft" as const };
    expect(draftRoomMode(state, false)).toBe("approaching");
    expect(draftRoomMode({ ...state, userTeamId: state.teams[0]!.id }, false)).toBe("approaching");
  });

  it("gives complete and emergency their own branches, complete first", () => {
    const state = onClockState();
    expect(draftRoomMode(state, true)).toBe("emergency");
    expect(draftRoomMode({ ...state, status: "complete" }, true)).toBe("complete");
  });
});

describe("shortlistView", () => {
  it.each([false, true])("rechecks consecutive picks against the current roster (explicit order: %s)", (explicitOrder) => {
    const base = createMockDraftState(0);
    const players = (["RB", "RB", "TE"] as const).map((position, index) => ({
      ...base.players[index]!, id: `choice-${index}`, position,
    }));
    const state: DraftState = {
      ...base, status: "drafting", currentPick: 2, userTeamId: "user",
      settings: { ...base.settings, teams: 2, rounds: 2, rosterSlots: { RB: 1, TE: 1 } },
      teams: [
        { id: "other", name: "Other", draftSlot: 1, roster: [] },
        { id: "user", name: "User", draftSlot: 2, roster: [] },
      ], players, picks: [], pickOrder: undefined,
    };
    if (explicitOrder) state.pickOrder = { source: "sleeper", entries: [
      { pickNo: 2, round: 1, draftSlot: 2, teamId: "user", originalTeamId: "user", isTraded: false },
      { pickNo: 3, round: 2, draftSlot: 2, teamId: "user", originalTeamId: "user", isTraded: false },
    ] };
    const strategy = call(state);
    expect(players.every((player) => isDraftChoiceRosterFeasible(state, player.id))).toBe(true);
    const next = afterPick(state, players[0]!.id, "user");
    next.teams = next.teams.map((team) => team.id === "user" ? { ...team, roster: [players[0]!.id] } : team);
    expect(draftRoomMode(next, false)).toBe("on-clock");
    expect(isDraftChoiceRosterFeasible(next, players[1]!.id)).toBe(false);
    expect(isDraftChoiceRosterFeasible(next, players[2]!.id)).toBe(true);
    const view = shortlistView(next, strategy, {});
    expect(view.ranked.map((option) => option.player.id)).toEqual([players[2]!.id]);
    expect(view.taken).toEqual([]);
    const empty = shortlistView(next, { ...strategy, payload: { ...strategy.payload, alternativeCandidates: strategy.payload.alternativeCandidates.slice(0, 1) } }, {});
    expect(empty.ranked).toEqual([]);
    expect(callAnnouncement(empty, "")).toContain("No player on this shortlist is available for your roster.");
    const keeper = { ...players[0]!, id: "keeper", position: "QB" as const };
    const traded: DraftState = { ...next,
      settings: { ...next.settings, rounds: 5 }, players: [...players, keeper],
      teams: next.teams.map((team) => team.id === "user" ? { ...team, roster: [...team.roster, keeper.id] } : team),
      picks: [...next.picks, { pickNo: 9, round: 5, draftSlot: 1, teamId: "user", playerId: keeper.id, isKeeper: true }],
      pickOrder: { source: "sleeper", entries: [9, 10].map((pickNo) => ({
        pickNo, round: 5, draftSlot: 1, teamId: "user", originalTeamId: "other", isTraded: true,
      })) },
    };
    for (const [currentPick, mode] of [[4, "waiting"], [8, "approaching"], [10, "on-clock"]] as const) {
      const board = { ...traded, currentPick };
      expect(draftRoomMode(board, false)).toBe(mode);
      expect(shortlistView(board, strategy, {}).ranked.map((option) => option.player.id)).toEqual([players[2]!.id]);
    }
    const initialLateAnswer = { ...strategy, payload: { ...strategy.payload,
      recommendedCandidate: strategy.payload.alternativeCandidates[0]!, alternativeCandidates: [strategy.payload.alternativeCandidates[1]!],
    } };
    expect(shortlistView(next, initialLateAnswer, {}).ranked.map((option) => option.player.id)).toEqual([players[2]!.id]);
  });

  it("keeps the Assistant's order and marks nothing when the list is intact", () => {
    const state = onClockState();
    const strategy = call(state);
    const view = shortlistView(state, strategy, {});
    expect(view.ranked.map((option) => option.player.id)).toEqual(availableOptions(state).map((option) => option.player.id));
    expect(view).toMatchObject({ taken: [], promoted: false, stale: false, fromPick: "1.09" });
  });

  it("strikes a taken target and promotes the Assistant's next choice without re-ranking", () => {
    const state = onClockState();
    const strategy = call(state);
    const [first, second, third, fourth] = strategy.payload.alternativeCandidates.length ? availableOptions(state) : [];
    const next = afterPick(state, first!.player.id);
    const view = shortlistView(next, strategy, {});
    expect(view.ranked.map((option) => option.player.id)).toEqual([second, third, fourth].map((option) => option!.player.id));
    expect(view.taken.map((row) => [row.option.player.id, row.takenBy])).toEqual([[first!.player.id, next.teams.find((team) => team.id !== next.userTeamId)!.name]]);
    expect(view).toMatchObject({ promoted: true, stale: true });
  });

  it("never presents an unavailable player as the top choice", () => {
    const state = onClockState();
    const strategy = call(state);
    let board = state;
    for (const option of availableOptions(state)) {
      board = afterPick(board, option.player.id);
      const view = shortlistView(board, strategy, {});
      const drafted = new Set(board.picks.map((pick) => pick.playerId));
      expect(view.ranked.every((entry) => !drafted.has(entry.player.id))).toBe(true);
    }
    expect(shortlistView(board, strategy, {}).ranked).toEqual([]);
  });

  it("drops a player the user just excluded", () => {
    const state = onClockState();
    const strategy = call(state);
    const [first, second] = availableOptions(state);
    const view = shortlistView(state, strategy, { [first!.player.id]: "exclude" });
    expect(view.ranked[0]?.player.id).toBe(second!.player.id);
    expect(view).toMatchObject({ promoted: true, taken: [] });
  });

  it("does not strike the user's own earlier selections", () => {
    const state = onClockState();
    const strategy = call(state);
    const [first] = availableOptions(state);
    const view = shortlistView(afterPick(state, first!.player.id, state.userTeamId), strategy, {});
    expect(view.taken).toEqual([]);
    expect(view.promoted).toBe(true);
  });

  it("carries struck rows across a refresh and caps them at the two newest", () => {
    const state = onClockState();
    const first = call(state);
    const [a, b, c] = availableOptions(state);
    const board = afterPick(afterPick(afterPick(state, a!.player.id), b!.player.id), c!.player.id);
    const carried = carriedTakenOptions(first, board);
    expect(carried.map((option) => option.player.id)).toEqual([a, b, c].map((option) => option!.player.id));
    const refreshed = call(board, carried);
    const view = shortlistView(board, refreshed, {});
    expect(view.taken.map((row) => row.option.player.id)).toEqual([c, b].map((option) => option!.player.id));
    expect(view).toMatchObject({ promoted: false, stale: false });
  });

  it("drops carried rows once the user has picked since they went", () => {
    const state = onClockState();
    const [a, b] = availableOptions(state);
    const taken = afterPick(state, a!.player.id);
    const strategy = call(state);
    const afterUserPick = afterPick(taken, b!.player.id, state.userTeamId);
    expect(shortlistView({ ...afterUserPick, currentPick: afterUserPick.currentPick + 1 }, strategy, {}).taken).toEqual([]);
  });
});

describe("reason line", () => {
  it("prefers the model's line", () => {
    expect(decisionReasonLine(decision({ reasonLine: "Best value at a need." }))).toBe("Best value at a need.");
  });

  it.each([
    ["A.J. Brown fills the WR need. He also leads the tier.", "A.J. Brown fills the WR need."],
    ["Amon-Ra St. Brown is the safest target left. Take him now.", "Amon-Ra St. Brown is the safest target left."],
    ["Take him vs. Dallas at this cost. Fill WR next.", "Take him vs. Dallas at this cost."],
    ["No sentence end here", "No sentence end here"],
  ])("falls back to the first sentence of %s", (summary, line) => {
    expect(decisionReasonLine(decision({ summary }))).toBe(line);
  });

  it("clips a long fallback on a word boundary", () => {
    const summary = `${"Word ".repeat(40)}end.`;
    const line = decisionReasonLine(decision({ summary }));
    expect(line.endsWith("Word…")).toBe(true);
    expect(line.length).toBeLessThanOrEqual(121);
  });

  it("explains a promoted row as the Assistant's next choice", () => {
    const state = onClockState();
    const strategy = call(state);
    const view = shortlistView(afterPick(state, strategy.payload.recommendedCandidate.player.id), strategy, {});
    expect(shortlistReason(view, strategy.payload.decision, true)).toBe("The Assistant's next choice. New call on the way.");
    expect(shortlistReason(view, strategy.payload.decision, false)).toBe("The Assistant's next choice.");
  });
});

describe("facts and announcements", () => {
  it("shows only labeled numbers, never placeholders", () => {
    const [option] = availableOptions(onClockState());
    expect(shortlistFacts(option!).proj).toMatch(/^\d+$/);
    const placeholder = { ...option!, player: { ...option!.player, projectionSource: "sleeper_search_rank" as const, adpSource: null, seasonProjectedPoints: null } };
    expect(shortlistFacts(placeholder)).toEqual({ adp: null, proj: null });
  });

  it("reports the last picks by position, newest first", () => {
    const state = onClockState();
    const positions = recentPickPositions(state);
    const byId = new Map(state.players.map((player) => [player.id, player.position]));
    const newest = [...state.picks].sort((a, b) => b.pickNo - a.pickNo).slice(0, 3).map((pick) => byId.get(pick.playerId));
    expect(positions).toEqual(newest);
    expect(recentPickPositions({ ...state, picks: [] })).toEqual([]);
  });

  it("labels contingencies only while the call is contingent", () => {
    const state = onClockState();
    const [, second] = availableOptions(state);
    expect(contingencyLabel(state, second!)).toBeNull();
    const waiting = { ...state, userTeamId: state.teams.find((team) => team.draftSlot === 1)!.id };
    expect(contingencyLabel(waiting, second!)).toBe("Elite faller");
    expect(contingencyLabel(waiting, { ...second!, player: { ...second!.player, importedRank: 100 } })).toMatch(/ range$/);
  });

  it("announces the top call, a promotion, and an empty list once each", () => {
    const state = onClockState();
    const strategy = call(state);
    const [first, second] = availableOptions(state);
    expect(callAnnouncement(shortlistView(state, strategy, {}), "")).toBe(`The Assistant recommends ${first!.player.name}.`);
    const taken = afterPick(state, first!.player.id);
    const owner = taken.teams.find((team) => team.id !== taken.userTeamId)!.name;
    expect(callAnnouncement(shortlistView(taken, strategy, {}), "")).toBe(`${first!.player.name} was taken by ${owner}. ${second!.player.name} is the Assistant's next choice.`);
    let board = state;
    for (const option of availableOptions(state)) board = afterPick(board, option.player.id);
    expect(callAnnouncement(shortlistView(board, strategy, {}), "")).toContain("Use Find player");
    expect(callAnnouncement(null, "")).toBe("");
    expect(callAnnouncement(null, "Failed")).toBe("The Assistant call could not update.");
  });
});
