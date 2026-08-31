import type { Player, Position, TeamDataReadiness, TeamManagerState, WeeklyProjectionImportSummary } from "@sleeper-draft-assistant/shared";

const teamPositions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const millisecondsPerDay = 86_400_000;

export const WEEKLY_PROJECTION_STALE_AFTER_DAYS = 3;

export function isWeeklyProjectionSummaryFresh(
  summary: WeeklyProjectionImportSummary,
  now = Date.now(),
): boolean {
  const appliedAtValues = summary.positionResults.length > 0
    ? summary.positionResults.map((result) => result.appliedAt)
    : [summary.appliedAt];

  return appliedAtValues.every((appliedAt) => {
    const appliedAtMs = Date.parse(appliedAt);
    return Number.isFinite(appliedAtMs)
      && Math.max(0, now - appliedAtMs) < WEEKLY_PROJECTION_STALE_AFTER_DAYS * millisecondsPerDay;
  });
}

export function buildTeamDataReadiness(
  state: TeamManagerState,
  weeklyProjectionSummary: WeeklyProjectionImportSummary | null,
  now = Date.now(),
): TeamDataReadiness {
  const eligibleRosterPlayers = getUniqueActiveRosterPlayers(state);
  const relevantPositions = teamPositions.filter((position) =>
    (state.league.rosterSlots[position] ?? 0) > 0
      || eligibleRosterPlayers.some((player) => player.position === position),
  );
  const loadedPositions = relevantPositions.filter((position) => weeklyProjectionSummary?.positions.includes(position));
  const missingPositions = relevantPositions.filter((position) => !loadedPositions.includes(position));
  const projectedRosterPlayers = eligibleRosterPlayers.filter((player) =>
    player.projectionSource === "weekly_projection"
      && player.weeklyProjectionSeason === weeklyProjectionSummary?.season
      && player.weeklyProjectionWeek === weeklyProjectionSummary?.week,
  ).length;
  const rosterProjectionCoverage = eligibleRosterPlayers.length > 0
    ? projectedRosterPlayers / eligibleRosterPlayers.length
    : 0;
  const importMatchRate = weeklyProjectionSummary && weeklyProjectionSummary.rowsParsed > 0
    ? weeklyProjectionSummary.matched / weeklyProjectionSummary.rowsParsed
    : null;
  const warnings: string[] = [];
  const facts: string[] = [];
  const importIsFresh = weeklyProjectionSummary ? isWeeklyProjectionSummaryFresh(weeklyProjectionSummary, now) : false;

  if (!weeklyProjectionSummary) {
    warnings.push("No weekly projection import is loaded for this team view.");
  } else {
    facts.push(`FantasyPros ${weeklyProjectionSummary.season} Week ${weeklyProjectionSummary.week} was imported ${weeklyProjectionSummary.appliedAt}.`);
    warnings.push("Weekly FPTS are provider-scored; confirm the FantasyPros export uses this league's scoring format.");
    if (state.league.season && weeklyProjectionSummary.season !== state.league.season) {
      warnings.push(`Imported projections are for ${weeklyProjectionSummary.season}, but this league is ${state.league.season}.`);
    }
    if (!importIsFresh) {
      warnings.push("Weekly projections are 3 or more days old; import fresh files before using weekly advice.");
    }
    if (missingPositions.length > 0) warnings.push(`Missing projection files for ${missingPositions.join(", ")}.`);
    if (importMatchRate !== null && importMatchRate < 0.85) {
      warnings.push(`Only ${Math.round(importMatchRate * 100)}% of imported rows matched Sleeper players.`);
    }
  }

  facts.push(`${projectedRosterPlayers}/${eligibleRosterPlayers.length} active roster players have projections for the selected import.`);
  if (rosterProjectionCoverage < 0.8 && eligibleRosterPlayers.length > 0) {
    warnings.push(`Roster projection coverage is ${Math.round(rosterProjectionCoverage * 100)}%; lineup comparisons may be incomplete.`);
  }

  const importIsCurrent = Boolean(
    weeklyProjectionSummary
      && importIsFresh
      && (!state.league.season || weeklyProjectionSummary.season === state.league.season)
      && projectedRosterPlayers > 0,
  );
  const status: TeamDataReadiness["status"] = importIsCurrent
    && missingPositions.length === 0
    && rosterProjectionCoverage >= 0.8
    && (importMatchRate === null || importMatchRate >= 0.85)
    ? "ready"
    : importIsCurrent
      ? "partial"
      : "limited";
  const confidence: TeamDataReadiness["confidence"] = status === "ready" ? "high" : status === "partial" ? "medium" : "low";

  return {
    status,
    confidence,
    headline: status === "ready"
      ? "Weekly evidence is ready for Codex."
      : status === "partial"
        ? "Weekly evidence has coverage gaps."
        : "Weekly evidence is limited.",
    activeSeason: weeklyProjectionSummary?.season ?? state.league.season,
    activeWeek: weeklyProjectionSummary?.week ?? state.week,
    importedAt: weeklyProjectionSummary?.appliedAt ?? null,
    relevantPositions,
    loadedPositions,
    missingPositions,
    importMatchRate,
    rosterProjectionCoverage,
    projectedRosterPlayers,
    eligibleRosterPlayers: eligibleRosterPlayers.length,
    facts,
    warnings: Array.from(new Set(warnings)),
  };
}

function getUniqueActiveRosterPlayers(state: TeamManagerState): Player[] {
  const players = [...state.roster.starters.map((slot) => slot.player), ...state.roster.bench]
    .filter((player): player is Player => Boolean(player));
  return Array.from(new Map(players.map((player) => [player.id, player])).values());
}
