import { buildTeamLineupSummary, buildTeamNeedsSummary, buildTeamWaiverSummary } from "@sleeper-draft-assistant/engine";
import type { TeamActivitySummary, TeamDataReadiness, TeamLineupSummary, TeamManagerState, TeamNeedsSummary, TeamWaiverSummary, TeamWeekContext } from "@sleeper-draft-assistant/shared";

import type { AiConversationMessage, TeamAiContext } from "./types";

export function buildTeamAiContext(
  state: TeamManagerState,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  weekContext: TeamWeekContext | null = null,
  waiverSummary: TeamWaiverSummary | null = null,
  lineupSummary: TeamLineupSummary | null = null,
  activitySummary: TeamActivitySummary | null = null,
  dataReadiness: TeamDataReadiness | null = null,
): TeamAiContext {
  const teamNeeds = buildTeamNeedsSummary(state);
  const resolvedWaiverSummary = waiverSummary ?? buildTeamWaiverSummary(state, []);
  const resolvedLineupSummary = lineupSummary ?? buildTeamLineupSummary(state);
  const resolvedActivitySummary = activitySummary ?? emptyActivitySummary();
  return {
    task: "team_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    teamNeeds,
    lineupSummary: resolvedLineupSummary,
    teamBrief: buildTeamBrief(state, teamNeeds, weekContext, resolvedWaiverSummary, resolvedLineupSummary, resolvedActivitySummary, dataReadiness),
    teamState: state,
    dataReadiness,
    weekContext,
    waiverSummary: resolvedWaiverSummary,
    activitySummary: resolvedActivitySummary,
  };
}

function buildTeamBrief(state: TeamManagerState, teamNeeds: TeamNeedsSummary, weekContext: TeamWeekContext | null, waiverSummary: TeamWaiverSummary, lineupSummary: TeamLineupSummary, activitySummary: TeamActivitySummary, dataReadiness: TeamDataReadiness | null): TeamAiContext["teamBrief"] {
  const openStarterSlots = state.roster.starters
    .filter((slot) => !slot.player)
    .map((slot) => `${slot.slot} (${slot.eligiblePositions.join("/")})`);
  const starterCandidates = state.roster.starters.map((slot) =>
    slot.player
      ? `${slot.slot}: ${slot.player.name} (${slot.player.team} ${slot.player.position})`
      : `${slot.slot}: open (${slot.eligiblePositions.join("/")})`,
  );
  const benchPlayers = state.roster.bench.map((player) => `${player.name} (${player.team} ${player.position})`);
  const hasWeeklyProjections = teamHasWeeklyProjections(state) || waiverSummary.candidates.some((candidate) => candidate.player.projectionSource === "weekly_projection");

  return {
    leagueFormat: `${state.league.teams}-team ${state.league.scoring}, slots ${formatRosterSlots(state.league.rosterSlots)}`,
    teamName: state.userTeam.name,
    week: state.week ? `Week ${state.week}` : "Week unavailable",
    rosterSummary: formatRosterCounts(state),
    lineupStatus: `${state.roster.starters.filter((slot) => slot.player).length}/${state.roster.starters.length} starter slots filled, ${state.roster.bench.length} bench players, ${state.roster.injuredReserve.length} IR, ${state.roster.taxi.length} taxi.`,
    lineupFacts: lineupSummary.facts,
    lineupDecisions: lineupSummary.decisions.slice(0, 8).map((decision) => `${decision.slot}: ${decision.status}; current ${decision.currentPlayer?.name ?? "open"}; recommended ${decision.recommendedPlayer?.name ?? "none"}; ${decision.reasons.join(" ")}`),
    dataReadinessFacts: dataReadiness
      ? [dataReadiness.headline, ...dataReadiness.facts, ...dataReadiness.warnings]
      : ["Weekly data readiness was not provided."],
    openStarterSlots,
    depthSignals: teamNeeds.facts,
    deterministicFacts: teamNeeds.facts,
    matchupFacts: weekContext?.facts ?? ["No Sleeper weekly matchup context is loaded."],
    waiverFacts: waiverSummary.facts,
    topWaiverCandidates: waiverSummary.candidates.slice(0, 5).map((candidate) => `${candidate.player.name} (${candidate.player.team} ${candidate.player.position}) - ${candidate.valueLabel}; ${candidate.reasons.join(" ")}`),
    topDropCandidates: waiverSummary.dropCandidates.slice(0, 4).map((candidate) => `${candidate.player.name} (${candidate.player.team} ${candidate.player.position}) - ${candidate.reasons.join(" ")}`),
    activityFacts: activitySummary.facts,
    recentTransactions: activitySummary.recentTransactions.slice(0, 5).map((transaction) => transaction.description),
    trendingAdds: activitySummary.trendingAdds.slice(0, 5).map((item) => `${item.player.name} (${item.player.team} ${item.player.position})${item.count !== null ? ` - ${item.count} adds` : ""}`),
    trendingDrops: activitySummary.trendingDrops.slice(0, 5).map((item) => `${item.player.name} (${item.player.team} ${item.player.position})${item.count !== null ? ` - ${item.count} drops` : ""}`),
    opponent: weekContext?.opponentTeamName ?? null,
    weakestPositions: teamNeeds.weakestPositions,
    starterCandidates,
    benchPlayers,
    dataWarnings: [...(dataReadiness?.warnings ?? []), ...state.dataQuality.limitations, ...teamNeeds.limitations, ...lineupSummary.limitations, ...(weekContext?.limitations ?? []), ...waiverSummary.limitations, ...activitySummary.limitations],
    responseRules: [
      "Answer only from the provided Sleeper team context.",
      hasWeeklyProjections
        ? "Use imported weekly projections when they are present; do not invent injuries, waiver-wire availability, or player news."
        : "Do not invent projections, injuries, waiver-wire availability, or player news.",
      "Use weekContext only for current Sleeper matchup, lineup, and score state; do not treat it as projections.",
      "For start/sit and lineup optimization questions, use lineupSummary and lineupDecisions before general roster-shape advice.",
      "Use dataReadinessFacts to qualify confidence; never present incomplete or mismatched projection data as current.",
      "For add/drop questions, use waiverSummary, activitySummary, topWaiverCandidates, and trendingAdds before general roster-shape advice.",
      "If a starter slot is open, prioritize filling that slot before bench-upgrade advice.",
      "Keep the answer concise and action-oriented.",
    ],
  };
}


function teamHasWeeklyProjections(state: TeamManagerState): boolean {
  return [
    ...state.roster.starters.map((slot) => slot.player),
    ...state.roster.bench,
    ...state.roster.injuredReserve,
    ...state.roster.taxi,
  ].some((player) => player?.projectionSource === "weekly_projection");
}

function formatRosterCounts(state: TeamManagerState): string {
  return (["QB", "RB", "WR", "TE", "K", "DEF"] as const)
    .map((position) => `${position}:${state.roster.positionCounts[position] ?? 0}`)
    .join(" ");
}

function formatRosterSlots(slots: Record<string, number>): string {
  return Object.entries(slots)
    .filter(([, count]) => count > 0)
    .map(([slot, count]) => `${slot}:${count}`)
    .join("/");
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
