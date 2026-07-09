import type { CandidateSignal, ConnectDraft, DraftState, RankingImportSummary } from "./types";

export function isMockDraft(draftId: string) {
  return draftId === "mock" || draftId === "mock-draft";
}

export function draftSlotToRosterFallback(draft: ConnectDraft) {
  return draft.userDraftSlot ? String(draft.userDraftSlot) : null;
}

const ROSTER_SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "K", "DEF"];

export function formatRosterSlots(slots: Record<string, number>) {
  return ROSTER_SLOT_ORDER.filter((slot) => slots[slot])
    .map((slot) => `${slot} ${slots[slot]}`)
    .join(" / ");
}

export function sourceLabel(candidate: CandidateSignal) {
  if (candidate.player.projectionSource === "sleeper_search_rank") {
    return "Sleeper rank placeholder";
  }

  if (candidate.player.projectionSource === "mock") {
    return "Demo projection";
  }

  return candidate.player.importedSource ? `${candidate.player.importedSource} import` : "Imported data";
}

export function formatImportDate(summary: RankingImportSummary) {
  return new Date(summary.appliedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function playerName(state: DraftState | null, playerId: string): string {
  return state?.players.find((player) => player.id === playerId)?.name ?? playerId;
}

export function teamName(state: DraftState | null, teamId: string): string {
  return state?.teams.find((team) => team.id === teamId)?.name ?? teamId;
}

export function getUserTeam(state: DraftState | null) {
  if (!state) {
    return null;
  }

  return state.teams.find((team) => team.id === state.userTeamId) ?? null;
}

export function draftSlotForPick(pickNo: number, teamCount: number): number {
  if (teamCount <= 0 || pickNo <= 0) {
    return 1;
  }

  const pickIndex = pickNo - 1;
  const roundIndex = Math.floor(pickIndex / teamCount);
  const positionInRound = pickIndex % teamCount;
  return roundIndex % 2 === 0 ? positionInRound + 1 : teamCount - positionInRound;
}

export function picksUntilUserTurn(state: DraftState | null): number | null {
  const userTeam = getUserTeam(state);
  if (!state || !userTeam || state.status === "complete") {
    return null;
  }

  const teamCount = state.settings.teams;
  const totalPicks = teamCount * state.settings.rounds;
  for (let pickNo = state.currentPick; pickNo <= totalPicks; pickNo += 1) {
    if (draftSlotForPick(pickNo, teamCount) === userTeam.draftSlot) {
      return pickNo - state.currentPick;
    }
  }

  return null;
}

export function isUserOnTheClock(state: DraftState | null): boolean {
  return picksUntilUserTurn(state) === 0;
}

export function rosterFitLabel(rosterFit: CandidateSignal["rosterFit"]) {
  switch (rosterFit) {
    case "need":
      return "Fills a need";
    case "depth":
      return "Adds depth";
    case "luxury":
      return "Luxury pick";
    default:
      return rosterFit;
  }
}
