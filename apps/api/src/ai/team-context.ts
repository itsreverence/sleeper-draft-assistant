import type { Player, Position, TeamActivitySummary, TeamDataReadiness, TeamManagerState, TeamWeekContext } from "@sleeper-draft-assistant/shared";
import { sleeperDepthChartLabel } from "@sleeper-draft-assistant/shared/player-status";

import type { AiConversationMessage, TeamAiContext, TeamAvailablePlayerEvidence } from "./types";

const fantasyPositions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

export function buildTeamAiContext(
  state: TeamManagerState,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  weekContext: TeamWeekContext | null = null,
  availablePlayers: Player[] = [],
  activitySummary: TeamActivitySummary | null = null,
  dataReadiness: TeamDataReadiness | null = null,
  selectedWeek: number | null = null,
): TeamAiContext {
  const resolvedActivitySummary = activitySummary ?? emptyActivitySummary();
  const { evidence, groups } = buildAvailablePlayerEvidence(availablePlayers);
  return {
    task: "team_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    teamBrief: buildTeamBrief(state, weekContext, resolvedActivitySummary, dataReadiness, selectedWeek),
    teamState: state,
    dataReadiness,
    weekContext,
    activitySummary: resolvedActivitySummary,
    availablePlayerEvidence: evidence,
    availablePlayerGroups: groups,
  };
}

function buildTeamBrief(
  state: TeamManagerState,
  weekContext: TeamWeekContext | null,
  activitySummary: TeamActivitySummary,
  dataReadiness: TeamDataReadiness | null,
  selectedWeek: number | null,
): TeamAiContext["teamBrief"] {
  const openStarterSlots = state.roster.starters
    .filter((slot) => !slot.player)
    .map((slot) => `${slot.slot} (${slot.eligiblePositions.join("/")})`);
  const starterCandidates = state.roster.starters.map((slot) =>
    slot.player
      ? `${slot.slot}: ${formatPlayer(slot.player)}`
      : `${slot.slot}: open (${slot.eligiblePositions.join("/")})`,
  );
  const benchPlayers = state.roster.bench.map(formatPlayer);
  const hasWeeklyProjections = dataReadiness?.status !== "limited" && teamHasWeeklyProjections(state);
  const hasRosRankings = teamHasRosRankings(state);
  const hasDraftEcrFallback = teamHasDraftEcrFallback(state);
  const effectiveWeek = selectedWeek ?? weekContext?.week ?? state.week;
  const isPinnedWeek = state.seasonPhase === "regular"
    && effectiveWeek !== null
    && state.week !== null
    && effectiveWeek !== state.week;

  return {
    leagueFormat: `${state.league.teams}-team ${state.league.scoring}, slots ${formatRosterSlots(state.league.rosterSlots)}`,
    teamName: state.userTeam.name,
    week: state.seasonPhase === "preseason"
      ? "Preseason"
      : effectiveWeek
        ? isPinnedWeek
          ? `Week ${effectiveWeek} selected (Sleeper active Week ${state.week})`
          : `Week ${effectiveWeek}`
        : "Week unavailable",
    rosterSummary: formatRosterCounts(state),
    lineupStatus: `${state.roster.starters.filter((slot) => slot.player).length}/${state.roster.starters.length} starter slots filled, ${state.roster.bench.length} bench players, ${state.roster.injuredReserve.length} IR, ${state.roster.taxi.length} taxi.`,
    dataReadinessFacts: dataReadiness
      ? [dataReadiness.headline, ...dataReadiness.facts, ...dataReadiness.warnings]
      : ["Weekly data readiness was not provided."],
    openStarterSlots,
    matchupFacts: weekContext?.facts ?? ["No current Sleeper weekly matchup context is loaded."],
    activityFacts: activitySummary.facts,
    recentTransactions: activitySummary.recentTransactions.slice(0, 5).map((transaction) => transaction.description),
    trendingAdds: activitySummary.trendingAdds.slice(0, 5).map((item) => `${formatPlayer(item.player)}${item.count !== null ? ` - ${item.count} adds` : ""}`),
    trendingDrops: activitySummary.trendingDrops.slice(0, 5).map((item) => `${formatPlayer(item.player)}${item.count !== null ? ` - ${item.count} drops` : ""}`),
    opponent: weekContext?.opponentTeamName ?? null,
    starterCandidates,
    benchPlayers,
    dataWarnings: [
      ...(dataReadiness?.warnings ?? []),
      ...state.dataQuality.limitations,
      ...(weekContext?.limitations ?? []),
      ...activitySummary.limitations,
      "Available-player status is inferred from players not currently rostered in the Sleeper league.",
    ],
    responseRules: [
      "Answer only from the supplied Sleeper state and separate raw evidence signals.",
      "Reason independently. No local lineup, waiver, drop, or roster-priority recommendation has been supplied.",
      ...(isPinnedWeek
        ? [`The user selected Week ${effectiveWeek} while Sleeper's active week is Week ${state.week}; keep matchup, activity, and weekly projection advice scoped to Week ${effectiveWeek}.`]
        : []),
      hasWeeklyProjections
        ? "Use imported weekly projections as one current-week signal; do not invent injuries, news, or projections."
        : "Current weekly projections are incomplete or absent; do not invent them.",
      hasRosRankings
        ? "Use rest-of-season ranks as a separate long-term signal rather than combining them into a hidden score."
        : hasDraftEcrFallback
          ? "ROS ECR is absent. Use draft ECR fallback only as provisional season-value evidence and identify it as a fallback when long-term value matters."
          : "Current season-value rankings are incomplete or absent; say so when long-term value matters.",
      "Use weekContext only for the selected Sleeper week's matchup, lineup, and score state; do not treat it as projections.",
      "For add/drop questions, verify that an add appears in availablePlayerEvidence and that a drop appears on the user's roster.",
      "For lineup questions, verify slot eligibility from teamState before recommending a change.",
      "Qualify confidence using dataReadinessFacts and dataWarnings.",
      "Keep the answer concise and action-oriented.",
    ],
  };
}

function buildAvailablePlayerEvidence(players: Player[]): {
  evidence: TeamAvailablePlayerEvidence[];
  groups: TeamAiContext["availablePlayerGroups"];
} {
  const eligible = uniquePlayers(players.filter((player) => fantasyPositions.includes(player.position)));
  const weeklyProjectionLeaders = eligible
    .filter((player) => player.weeklyProjectedPoints !== null && player.weeklyProjectedPoints !== undefined)
    .sort((a, b) => (b.weeklyProjectedPoints ?? 0) - (a.weeklyProjectedPoints ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 30)
    .map((player) => player.id);
  const restOfSeasonRankLeaders = eligible
    .filter((player) => player.rosRank !== null && player.rosRank !== undefined)
    .sort((a, b) => (a.rosRank ?? Number.MAX_SAFE_INTEGER) - (b.rosRank ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name))
    .slice(0, 30)
    .map((player) => player.id);
  const draftEcrFallbackLeaders = eligible
    .filter((player) => isDraftEcrFallbackPlayer(player) && player.importedRank !== null && player.importedRank !== undefined)
    .sort((a, b) => (a.importedRank ?? Number.MAX_SAFE_INTEGER) - (b.importedRank ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name))
    .slice(0, 30)
    .map((player) => player.id);
  const positionCoverage = Object.fromEntries(fantasyPositions.map((position) => [
    position,
    eligible
      .filter((player) => player.position === position)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12)
      .map((player) => player.id),
  ])) as Record<Position, string[]>;
  const includedIds = new Set([
    ...weeklyProjectionLeaders,
    ...restOfSeasonRankLeaders,
    ...draftEcrFallbackLeaders,
    ...Object.values(positionCoverage).flat(),
  ]);

  return {
    evidence: eligible
      .filter((player) => includedIds.has(player.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toAvailablePlayerEvidence),
    groups: { weeklyProjectionLeaders, restOfSeasonRankLeaders, draftEcrFallbackLeaders, positionCoverage },
  };
}

function toAvailablePlayerEvidence(player: Player): TeamAvailablePlayerEvidence {
  return {
    playerId: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    weeklyProjectedPoints: player.weeklyProjectedPoints ?? null,
    weeklyProjectionWeek: player.weeklyProjectionWeek ?? null,
    restOfSeasonRank: player.rosRank ?? null,
    restOfSeasonBestRank: player.rosBestRank ?? null,
    restOfSeasonWorstRank: player.rosWorstRank ?? null,
    draftEcrFallbackRank: isDraftEcrFallbackPlayer(player) ? player.importedRank ?? null : null,
    draftEcrFallbackPositionRank: isDraftEcrFallbackPlayer(player) ? player.importedPositionRank ?? null : null,
    riskTags: player.riskTags,
    sleeperStatus: player.sleeperStatus ?? null,
  };
}

function formatPlayer(player: Player): string {
  const riskTags = player.sleeperStatus?.injuryStatus
    ? player.riskTags.filter((tag) => !tag.toLowerCase().startsWith("injury:"))
    : player.riskTags;
  const signals = [
    player.weeklyProjectedPoints !== null && player.weeklyProjectedPoints !== undefined
      ? `weekly ${player.weeklyProjectedPoints.toFixed(1)}`
      : null,
    player.rosRank ? `ROS ${player.rosRank}` : null,
    !player.rosRank && isDraftEcrFallbackPlayer(player) && player.importedRank
      ? `draft ECR fallback ${player.importedRank}`
      : null,
    riskTags.length ? `flags ${riskTags.join(", ")}` : null,
    player.sleeperStatus?.injuryStatus ? `injury ${player.sleeperStatus.injuryStatus}` : null,
    player.sleeperStatus?.practiceParticipation ? `practice ${player.sleeperStatus.practiceParticipation}` : null,
    player.sleeperStatus?.rosterStatus && player.sleeperStatus.rosterStatus.toLowerCase() !== "active"
      ? `roster ${player.sleeperStatus.rosterStatus}`
      : null,
    sleeperDepthChartLabel(player.sleeperStatus) ? `depth ${sleeperDepthChartLabel(player.sleeperStatus)}` : null,
  ].filter(Boolean);
  return `${player.name} (${player.team} ${player.position})${signals.length ? ` - ${signals.join("; ")}` : ""}`;
}

function uniquePlayers(players: Player[]): Player[] {
  return Array.from(new Map(players.map((player) => [player.id, player])).values());
}

function teamHasWeeklyProjections(state: TeamManagerState): boolean {
  return teamPlayers(state).some((player) => player.projectionSource === "weekly_projection");
}

function teamHasRosRankings(state: TeamManagerState): boolean {
  return teamPlayers(state).some((player) => Boolean(player.rosRank));
}

function teamHasDraftEcrFallback(state: TeamManagerState): boolean {
  return teamPlayers(state).some(isDraftEcrFallbackPlayer);
}

function isDraftEcrFallbackPlayer(player: Player): boolean {
  return player.importedSource === "FantasyPros draft ECR fallback";
}

function teamPlayers(state: TeamManagerState): Player[] {
  return [
    ...state.roster.starters.map((slot) => slot.player),
    ...state.roster.bench,
    ...state.roster.injuredReserve,
    ...state.roster.taxi,
  ].filter((player): player is Player => player !== null);
}

function formatRosterCounts(state: TeamManagerState): string {
  return fantasyPositions.map((position) => `${position}:${state.roster.positionCounts[position] ?? 0}`).join(" ");
}

function formatRosterSlots(slots: Record<string, number>): string {
  return Object.entries(slots).filter(([, count]) => count > 0).map(([slot, count]) => `${slot}:${count}`).join("/");
}

function emptyActivitySummary(): TeamActivitySummary {
  return {
    headline: "No Sleeper activity context is loaded yet.",
    week: null,
    recentTransactions: [],
    trendingAdds: [],
    trendingDrops: [],
    facts: ["No Sleeper activity context is loaded yet."],
    limitations: ["Sleeper activity context was not provided."],
    updatedAt: new Date().toISOString(),
  };
}
