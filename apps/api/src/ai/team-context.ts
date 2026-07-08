import { buildTeamLineupSummary, buildTeamNeedsSummary, buildTeamWaiverSummary } from "@sleeper-ai/engine";
import type { TeamLineupSummary, TeamManagerState, TeamNeedsSummary, TeamWaiverSummary, TeamWeekContext } from "@sleeper-ai/shared";

import type { AiConversationMessage, TeamAiContext } from "./types";

export function buildTeamAiContext(
  state: TeamManagerState,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  weekContext: TeamWeekContext | null = null,
  waiverSummary: TeamWaiverSummary | null = null,
  lineupSummary: TeamLineupSummary | null = null,
): TeamAiContext {
  const teamNeeds = buildTeamNeedsSummary(state);
  const resolvedWaiverSummary = waiverSummary ?? buildTeamWaiverSummary(state, []);
  const resolvedLineupSummary = lineupSummary ?? buildTeamLineupSummary(state);
  return {
    task: "team_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    teamNeeds,
    lineupSummary: resolvedLineupSummary,
    teamBrief: buildTeamBrief(state, teamNeeds, weekContext, resolvedWaiverSummary, resolvedLineupSummary),
    teamState: state,
    weekContext,
    waiverSummary: resolvedWaiverSummary,
  };
}

function buildTeamBrief(state: TeamManagerState, teamNeeds: TeamNeedsSummary, weekContext: TeamWeekContext | null, waiverSummary: TeamWaiverSummary, lineupSummary: TeamLineupSummary): TeamAiContext["teamBrief"] {
  const openStarterSlots = state.roster.starters
    .filter((slot) => !slot.player)
    .map((slot) => `${slot.slot} (${slot.eligiblePositions.join("/")})`);
  const starterCandidates = state.roster.starters.map((slot) =>
    slot.player
      ? `${slot.slot}: ${slot.player.name} (${slot.player.team} ${slot.player.position})`
      : `${slot.slot}: open (${slot.eligiblePositions.join("/")})`,
  );
  const benchPlayers = state.roster.bench.map((player) => `${player.name} (${player.team} ${player.position})`);

  return {
    leagueFormat: `${state.league.teams}-team ${state.league.scoring}, slots ${formatRosterSlots(state.league.rosterSlots)}`,
    teamName: state.userTeam.name,
    week: state.week ? `Week ${state.week}` : "Week unavailable",
    rosterSummary: formatRosterCounts(state),
    lineupStatus: `${state.roster.starters.filter((slot) => slot.player).length}/${state.roster.starters.length} starter slots filled, ${state.roster.bench.length} bench players, ${state.roster.injuredReserve.length} IR, ${state.roster.taxi.length} taxi.`,
    lineupFacts: lineupSummary.facts,
    lineupDecisions: lineupSummary.decisions.slice(0, 8).map((decision) => `${decision.slot}: ${decision.status}; current ${decision.currentPlayer?.name ?? "open"}; recommended ${decision.recommendedPlayer?.name ?? "none"}; ${decision.reasons.join(" ")}`),
    openStarterSlots,
    depthSignals: teamNeeds.facts,
    deterministicFacts: teamNeeds.facts,
    matchupFacts: weekContext?.facts ?? ["No Sleeper weekly matchup context is loaded."],
    waiverFacts: waiverSummary.facts,
    topWaiverCandidates: waiverSummary.candidates.slice(0, 5).map((candidate) => `${candidate.player.name} (${candidate.player.team} ${candidate.player.position}) - ${candidate.valueLabel}; ${candidate.reasons.join(" ")}`),
    topDropCandidates: waiverSummary.dropCandidates.slice(0, 4).map((candidate) => `${candidate.player.name} (${candidate.player.team} ${candidate.player.position}) - ${candidate.reasons.join(" ")}`),
    opponent: weekContext?.opponentTeamName ?? null,
    weakestPositions: teamNeeds.weakestPositions,
    starterCandidates,
    benchPlayers,
    dataWarnings: [...state.dataQuality.limitations, ...teamNeeds.limitations, ...lineupSummary.limitations, ...(weekContext?.limitations ?? []), ...waiverSummary.limitations],
    responseRules: [
      "Answer only from the provided Sleeper team context.",
      "Do not invent projections, injuries, waiver-wire availability, or player news.",
      "Use weekContext only for current Sleeper matchup, lineup, and score state; do not treat it as projections.",
      "For start/sit and lineup optimization questions, use lineupSummary and lineupDecisions before general roster-shape advice.",
      "For add/drop questions, use waiverSummary and topWaiverCandidates before general roster-shape advice.",
      "If a starter slot is open, prioritize filling that slot before bench-upgrade advice.",
      "Keep the answer concise and action-oriented.",
    ],
  };
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




