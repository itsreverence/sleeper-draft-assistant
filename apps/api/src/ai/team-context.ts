import { buildTeamNeedsSummary } from "@sleeper-ai/engine";
import type { TeamManagerState, TeamNeedsSummary } from "@sleeper-ai/shared";

import type { AiConversationMessage, TeamAiContext } from "./types";

export function buildTeamAiContext(
  state: TeamManagerState,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
): TeamAiContext {
  const teamNeeds = buildTeamNeedsSummary(state);
  return {
    task: "team_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    teamNeeds,
    teamBrief: buildTeamBrief(state, teamNeeds),
    teamState: state,
  };
}

function buildTeamBrief(state: TeamManagerState, teamNeeds: TeamNeedsSummary): TeamAiContext["teamBrief"] {
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
    openStarterSlots,
    depthSignals: teamNeeds.facts,
    deterministicFacts: teamNeeds.facts,
    weakestPositions: teamNeeds.weakestPositions,
    starterCandidates,
    benchPlayers,
    dataWarnings: [...state.dataQuality.limitations, ...teamNeeds.limitations],
    responseRules: [
      "Answer only from the provided Sleeper team context.",
      "Do not invent projections, injuries, matchup data, waiver-wire availability, or player news.",
      "If the user asks for lineup optimization, explain that current advice is based on roster structure and Sleeper metadata only.",
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

