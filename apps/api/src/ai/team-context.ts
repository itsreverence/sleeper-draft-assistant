import type { Position, TeamManagerState } from "@sleeper-ai/shared";

import type { AiConversationMessage, TeamAiContext } from "./types";

const corePositions: Position[] = ["QB", "RB", "WR", "TE"];

export function buildTeamAiContext(
  state: TeamManagerState,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
): TeamAiContext {
  return {
    task: "team_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    teamBrief: buildTeamBrief(state),
    teamState: state,
  };
}

function buildTeamBrief(state: TeamManagerState): TeamAiContext["teamBrief"] {
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
    depthSignals: buildDepthSignals(state, openStarterSlots),
    starterCandidates,
    benchPlayers,
    dataWarnings: state.dataQuality.limitations,
    responseRules: [
      "Answer only from the provided Sleeper team context.",
      "Do not invent projections, injuries, matchup data, waiver-wire availability, or player news.",
      "If the user asks for lineup optimization, explain that current advice is based on roster structure and Sleeper metadata only.",
      "If a starter slot is open, prioritize filling that slot before bench-upgrade advice.",
      "Keep the answer concise and action-oriented.",
    ],
  };
}

function buildDepthSignals(state: TeamManagerState, openStarterSlots: string[]): string[] {
  const signals: string[] = [];

  if (openStarterSlots.length > 0) {
    signals.push(`Open starter slots: ${openStarterSlots.join(", ")}.`);
  }

  for (const position of corePositions) {
    const rostered = state.roster.positionCounts[position] ?? 0;
    const required = state.league.rosterSlots[position] ?? 0;
    if (required > 0 && rostered < required) {
      signals.push(`${position} is below starter requirement (${rostered}/${required}).`);
    } else if (required > 0 && rostered === required) {
      signals.push(`${position} has starters covered but little direct depth (${rostered}/${required}).`);
    }
  }

  const flexSlots = (state.league.rosterSlots.FLEX ?? 0) + (state.league.rosterSlots.WR_RB_FLEX ?? 0) + (state.league.rosterSlots.REC_FLEX ?? 0);
  if (flexSlots > 0) {
    const flexEligible = (state.roster.positionCounts.RB ?? 0) + (state.roster.positionCounts.WR ?? 0) + (state.roster.positionCounts.TE ?? 0);
    const flexDemand = (state.league.rosterSlots.RB ?? 0) + (state.league.rosterSlots.WR ?? 0) + (state.league.rosterSlots.TE ?? 0) + flexSlots;
    signals.push(`RB/WR/TE flex depth is ${flexEligible}/${flexDemand} against starter-plus-flex demand.`);
  }

  if (signals.length === 0) {
    signals.push("No obvious roster-structure weakness is visible from Sleeper roster data alone.");
  }

  return signals;
}

function formatRosterCounts(state: TeamManagerState): string {
  return (["QB", "RB", "WR", "TE", "K", "DEF"] as Position[])
    .map((position) => `${position}:${state.roster.positionCounts[position] ?? 0}`)
    .join(" ");
}

function formatRosterSlots(slots: Record<string, number>): string {
  return Object.entries(slots)
    .filter(([, count]) => count > 0)
    .map(([slot, count]) => `${slot}:${count}`)
    .join("/");
}
