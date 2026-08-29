import type { ConnectDraft, DraftOption, DraftState, Player } from "./types";

export function isMockDraft(draftId: string) {
  return draftId === "mock" || draftId === "mock-draft";
}

export function draftTeamReference(draft: ConnectDraft, userRosterId: string | null) {
  return draft.userDraftSlot ? `slot-${draft.userDraftSlot}` : userRosterId;
}

const ROSTER_SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "K", "DEF"];

export function formatRosterSlots(slots: Record<string, number>) {
  return ROSTER_SLOT_ORDER.filter((slot) => slots[slot])
    .map((slot) => `${slot} ${slots[slot]}`)
    .join(" / ");
}

export function sourceLabel(candidate: DraftOption) {
  if (candidate.player.projectionSource === "sleeper_search_rank") {
    return "Sleeper rank placeholder";
  }

  if (candidate.player.projectionSource === "mock") {
    return "Demo projection";
  }

  if (candidate.player.projectionSource === "weekly_projection") {
    return candidate.player.weeklyProjectionSource
      ? `${candidate.player.weeklyProjectionSource} weekly projection`
      : "Weekly projection";
  }

  return candidate.player.importedSource ? `${candidate.player.importedSource} import` : "Imported data";
}

export function formatImportDate(summary: { appliedAt: string }) {
  return new Date(summary.appliedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatWeeklyProjection(player: Player | null | undefined) {
  return player?.weeklyProjectedPoints === null || player?.weeklyProjectedPoints === undefined
    ? null
    : `${player.weeklyProjectedPoints.toFixed(1)} pts`;
}

export function formatSleeperStatusSummary(player: Player | null | undefined): string | null {
  const status = player?.sleeperStatus;
  if (!status) return null;

  const details = [
    status.injuryStatus,
    compactActionablePracticeParticipation(status.practiceParticipation),
    status.rosterStatus && status.rosterStatus.toLowerCase() !== "active" ? status.rosterStatus : null,
  ].filter((detail): detail is string => Boolean(detail));

  return details.length > 0 ? Array.from(new Set(details)).join(" · ") : null;
}

export function formatSleeperStatusTitle(player: Player | null | undefined): string | undefined {
  const status = player?.sleeperStatus;
  if (!status) return undefined;

  const details = [
    status.injuryStatus ? `injury: ${status.injuryStatus}` : null,
    status.practiceParticipation ? `practice: ${status.practiceParticipation}` : null,
    status.rosterStatus && status.rosterStatus.toLowerCase() !== "active" ? `roster: ${status.rosterStatus}` : null,
    status.depthChartPosition && status.depthChartOrder
      ? `depth: ${status.depthChartPosition.toUpperCase()}${status.depthChartOrder}`
      : null,
    status.newsUpdatedAt ? `metadata updated: ${new Date(status.newsUpdatedAt).toLocaleString()}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return details.length > 0 ? `Sleeper status — ${details.join("; ")}` : undefined;
}

function compactActionablePracticeParticipation(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("did not participate")) return "DNP";
  if (normalized.includes("limited")) return "Limited";
  return null;
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
  const nextPick = upcomingUserPicks(state, 1)[0];
  if (!state || nextPick === undefined) {
    return null;
  }
  return nextPick - state.currentPick;
}

export function upcomingUserPicks(state: DraftState | null, limit = 2): number[] {
  const userTeam = getUserTeam(state);
  if (!state || !userTeam || state.status === "complete" || limit <= 0 || state.pickOrder?.source === "unsupported") {
    return [];
  }
  if (state.pickOrder?.entries.length) {
    return state.pickOrder.entries
      .filter((entry) => entry.pickNo >= state.currentPick && entry.teamId === state.userTeamId)
      .slice(0, limit)
      .map((entry) => entry.pickNo);
  }

  const picks: number[] = [];
  const totalPicks = state.settings.teams * state.settings.rounds;
  for (let pickNo = state.currentPick; pickNo <= totalPicks && picks.length < limit; pickNo += 1) {
    if (draftSlotForPick(pickNo, state.settings.teams) === userTeam.draftSlot) {
      picks.push(pickNo);
    }
  }
  return picks;
}

export function formatDraftPick(pickNo: number, teamCount: number): string {
  const round = Math.floor((pickNo - 1) / teamCount) + 1;
  const pickInRound = ((pickNo - 1) % teamCount) + 1;
  return `${round}.${String(pickInRound).padStart(2, "0")}`;
}

export function isUserOnTheClock(state: DraftState | null): boolean {
  return picksUntilUserTurn(state) === 0;
}

export type DraftPhase = DraftState["status"];
export type WorkspaceMode = "draft" | "manage";

export function getDraftPhase(state: DraftState | null): DraftPhase | null {
  return state?.status ?? null;
}

export function preferredWorkspaceMode(
  phase: DraftPhase | null,
  manageAvailable: boolean,
): WorkspaceMode {
  if (phase === "complete" && manageAvailable) {
    return "manage";
  }
  return "draft";
}

export function rosterFitLabel(rosterFit: DraftOption["rosterFit"]) {
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
