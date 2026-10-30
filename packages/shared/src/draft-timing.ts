import type { DraftState } from "./index";

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

export function remainingTeamPicks(state: Pick<DraftState, "status" | "picks" | "pickOrder" | "teams" | "settings" | "currentPick">, teamId: string, fromPick = state.currentPick): number[] {
  if (state.status === "complete" || state.pickOrder?.source === "unsupported") return [];
  const made = new Set(state.picks.map((pick) => pick.pickNo));
  if (state.pickOrder?.entries.length) {
    return state.pickOrder.entries
      .filter((entry) => entry.pickNo >= fromPick && entry.teamId === teamId && !made.has(entry.pickNo))
      .map((entry) => entry.pickNo);
  }
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
  return state.picks.filter((pick) => pick.pickNo < state.currentPick || state.status === "complete")
    .sort((a, b) => b.pickNo - a.pickNo).slice(0, limit);
}
