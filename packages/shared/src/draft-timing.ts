import type { DraftState } from "./index";

type TimingState = Pick<DraftState, "status" | "picks" | "pickOrder" | "teams" | "settings" | "currentPick">;

export function firstUnmadePick(picks: DraftState["picks"], totalPicks: number): number {
  const made = new Set(picks.map((pick) => pick.pickNo));
  let next = 1;
  while (made.has(next)) next += 1;
  return Math.min(next, totalPicks || next);
}

/** Unmade selections in [fromPick, toPick), excluding pre-filled keepers. */
export function countUnmadePicks(state: Pick<DraftState, "picks">, fromPick: number, toPick: number): number {
  const made = new Set(state.picks.map((pick) => pick.pickNo));
  let count = 0;
  for (let pickNo = fromPick; pickNo < toPick; pickNo += 1) {
    if (!made.has(pickNo)) count += 1;
  }
  return count;
}

export function remainingTeamPicks(state: TimingState, teamId: string, fromPick = state.currentPick): number[] {
  if (state.status === "complete" || state.pickOrder?.source === "unsupported") return [];
  const made = new Set(state.picks.map((pick) => pick.pickNo));
  if (state.pickOrder?.entries.length) {
    return state.pickOrder.entries
      .filter((entry) => entry.pickNo >= fromPick && entry.teamId === teamId && !made.has(entry.pickNo))
      .map((entry) => entry.pickNo);
  }
  return snakeSlotPicks(state, teamId, fromPick, made);
}

/** Selections still owed to a team. Unsupported timing hides turns, not the roster's remaining selections. */
export function remainingTeamSelections(state: TimingState, teamId: string): number {
  if (state.status !== "complete" && state.pickOrder?.source === "unsupported") {
    return snakeSlotPicks(state, teamId, state.currentPick, new Set(state.picks.map((pick) => pick.pickNo))).length;
  }
  return remainingTeamPicks(state, teamId).length;
}

function snakeSlotPicks(state: TimingState, teamId: string, fromPick: number, made: Set<number>): number[] {
  const slot = state.teams.find((team) => team.id === teamId)?.draftSlot;
  const picks: number[] = [];
  for (let pickNo = fromPick; pickNo <= state.settings.teams * state.settings.rounds; pickNo += 1) {
    const round = Math.ceil(pickNo / state.settings.teams);
    const inRound = ((pickNo - 1) % state.settings.teams) + 1;
    const draftSlot = round % 2 === 1 ? inRound : state.settings.teams + 1 - inRound;
    if (slot === draftSlot && !made.has(pickNo)) picks.push(pickNo);
  }
  return picks;
}

/** Future keeper allocations are roster evidence, not a recent run of selections. */
export function recentDraftPicks(state: DraftState, limit: number): DraftState["picks"] {
  return state.picks.filter((pick) => !pick.isKeeper || pick.pickNo < state.currentPick || state.status === "complete")
    .sort((a, b) => b.pickNo - a.pickNo).slice(0, limit);
}
