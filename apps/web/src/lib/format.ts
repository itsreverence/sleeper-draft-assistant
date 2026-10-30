import { sleeperDepthChartLabel } from "@sleeper-draft-assistant/shared/player-status";
import type { ConnectDraft, DraftOption, DraftState, Player, TeamManagerState, TeamWeekContext, WeeklyProjectionImportSummary } from "./types";

export function isMockDraft(draftId: string) {
  return draftId === "mock" || draftId === "mock-draft";
}

export function draftTeamReference(draft: ConnectDraft, userRosterId: string | null) {
  return draft.userDraftSlot ? `slot-${draft.userDraftSlot}` : userRosterId;
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

const STATUS_LABELS: Record<string, string> = {
  pre_draft: "Pre-draft",
  in_season: "In season",
  post_season: "Postseason",
  unknown: "Status unknown",
};

export function sentenceCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function formatStatus(status: string) {
  return STATUS_LABELS[status] ?? sentenceCase(status.replaceAll("_", " "));
}

export function formatConfidence(confidence: string) {
  return `${sentenceCase(confidence)} confidence`;
}

export function formatPlayerSchedule(player: Player): string | null {
  const schedule = player.schedule;
  if (schedule?.onBye === true) return "BYE";
  return schedule?.opponent ? `${schedule.homeAway === "away" ? "@" : "vs"} ${schedule.opponent}` : null;
}

export function formatWeeklyProjection(player: Player | null | undefined) {
  if (player?.schedule?.onBye === true) return "0 pts";
  return player?.weeklyProjectedPoints === null || player?.weeklyProjectedPoints === undefined
    ? null
    : `${player.weeklyProjectedPoints.toFixed(1)} pts`;
}

export function formatMissingProjection(player: Player, weeklySummary: WeeklyProjectionImportSummary | null) {
  return weeklySummary?.positions.includes(player.position) ? "No match" : `No ${player.position === "DEF" ? "DST" : player.position} file`;
}

const ROSTER_SLOT_LABELS: Readonly<Record<string, string>> = {
  WRRB_FLEX: "W/R",
  REC_FLEX: "W/T",
  SUPER_FLEX: "SFLX",
  SF: "SFLX",
};

export function rosterSlotTitle(slot: string) {
  const titles: Readonly<Record<string, string>> = {
    SUPER_FLEX: "Superflex", SF: "Superflex",
    WRRB_FLEX: "Wide receiver / running back flex",
    REC_FLEX: "Wide receiver / tight end flex",
  };
  return titles[slot] ?? slot;
}

export function formatRosterSlot(slot: string) {
  return ROSTER_SLOT_LABELS[slot] ?? slot;
}

export function effectiveTeamWeek(state: TeamManagerState | null, weekContext: TeamWeekContext | null, selectedWeek: number | null) {
  return selectedWeek ?? weekContext?.week ?? state?.week ?? null;
}

export function formatTeamContext(state: TeamManagerState, weekContext: TeamWeekContext | null, selectedWeek: number | null) {
  const week = effectiveTeamWeek(state, weekContext, selectedWeek);
  const period = state.seasonPhase === "preseason"
    ? ["Preseason"]
    : state.seasonPhase === "postseason"
      ? ["Postseason"]
      : week
        ? [
            `Week ${week}`,
            ...(weekContext?.opponentTeamName ? [`vs ${weekContext.opponentTeamName}`] : []),
            ...(selectedWeek && state.week && selectedWeek !== state.week ? [`Active Week ${state.week}`] : []),
          ]
        : ["Season"];
  return [...period, state.league.scoring.toUpperCase()].join(" · ");
}

export type RosterStatus = { label: string; tone: "warning" | "danger"; injury: boolean };

export function rosterStatus(player: Player): RosterStatus | null {
  const label = formatSleeperStatusSummary(player);
  if (label) {
    const status = player.sleeperStatus;
    const sidelined = /^(out|ir)$/i.test(status?.injuryStatus ?? "") || /injured reserve/i.test(status?.rosterStatus ?? "");
    return { label, tone: sidelined ? "danger" : "warning", injury: true };
  }
  return player.schedule?.onBye === true ? { label: "On bye", tone: "warning", injury: false } : null;
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
    sleeperDepthChartLabel(status) ? `depth: ${sleeperDepthChartLabel(status)}` : null,
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

// rememberedMode stands in for team data that has not arrived yet, so a completed draft does not flash its board.
export function preferredWorkspaceMode(
  phase: DraftPhase | null,
  manageAvailable: boolean,
  rememberedMode: WorkspaceMode | null = null,
): WorkspaceMode {
  if (phase === "complete" && (manageAvailable || rememberedMode === "manage")) {
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
