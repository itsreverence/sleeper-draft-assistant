import type { DraftRecommendation, DraftState, Player, Position } from "@sleeper-ai/shared";

import type { AiConversationMessage, DraftAiContext, PlayerPreferenceSummary } from "./types";

const positions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

export function buildDraftAiContext(
  state: DraftState,
  recommendation: DraftRecommendation,
  question: string,
  conversationHistory: AiConversationMessage[] = [],
  userPreferences: PlayerPreferenceSummary = { pinned: [], faded: [], excluded: [] },
): DraftAiContext {
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  const userTeam = state.teams.find((team) => team.id === state.userTeamId) ?? null;
  const candidateSources = new Set(recommendation.candidates.map((candidate) => candidate.player.projectionSource));

  return {
    task: "draft_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    userPreferences,
    dataQuality: {
      playerValueSource: describePlayerValueSource(candidateSources),
      hasImportedRankings: candidateSources.has("imported"),
      usesSleeperPlaceholderRanks: candidateSources.has("sleeper_search_rank"),
      limitations: getDataLimitations(candidateSources),
    },
    draft: {
      id: state.id,
      name: state.name,
      status: state.status,
      currentPick: state.currentPick,
      updatedAt: state.updatedAt,
    },
    settings: state.settings,
    rosterConstruction: buildRosterConstruction(state, userTeam, playersById),
    userTeam: userTeam
      ? {
          id: userTeam.id,
          name: userTeam.name,
          draftSlot: userTeam.draftSlot,
          roster: userTeam.roster.map((playerId) => playerSummary(playersById.get(playerId), playerId)),
        }
      : null,
    recentPicks: [...state.picks]
      .reverse()
      .slice(0, 12)
      .map((pick) => ({
        pickNo: pick.pickNo,
        round: pick.round,
        team: teamsById.get(pick.teamId)?.name ?? pick.teamId,
        player: playersById.get(pick.playerId)?.name ?? pick.playerId,
      })),
    recommendation: {
      headline: recommendation.headline,
      confidence: recommendation.confidence,
      summary: recommendation.summary,
      candidates: recommendation.candidates.map((candidate) => ({
        playerId: candidate.player.id,
        name: candidate.player.name,
        team: candidate.player.team,
        position: candidate.player.position,
        score: candidate.score,
        rosterFit: candidate.rosterFit,
        value: candidate.valueLabel,
        scarcity: candidate.scarcityLabel,
        returnProbability: candidate.returnProbability,
        reasons: candidate.reasons,
        source: candidate.player.projectionSource,
        importedRank: candidate.player.importedRank ?? null,
        tier: candidate.player.tier,
        byeWeek: candidate.player.byeWeek ?? null,
        riskTags: candidate.player.riskTags,
      })),
      risks: recommendation.risks,
      assumptions: recommendation.assumptions,
    },
  };
}

function buildRosterConstruction(
  state: DraftState,
  userTeam: DraftState["teams"][number] | null,
  playersById: Map<string, Player>,
): DraftAiContext["rosterConstruction"] {
  const counts = countRosterPositions(userTeam, playersById);
  const needs = positions
    .filter((position) => position !== "K" && position !== "DEF")
    .map((position) => ({
      position,
      drafted: counts[position],
      starterSlots: state.settings.rosterSlots[position] ?? 0,
      stillNeedsStarter: counts[position] < (state.settings.rosterSlots[position] ?? 0),
    }));
  const flexSlots = (state.settings.rosterSlots.FLEX ?? 0) + (state.settings.rosterSlots.SUPER_FLEX ?? 0);
  const draftedFlexEligible = counts.RB + counts.WR + counts.TE;

  return {
    rosterCounts: counts,
    startingSlots: state.settings.rosterSlots,
    flexSlots,
    draftedFlexEligible,
    primaryNeeds: needs.filter((need) => need.stillNeedsStarter).map((need) => need.position),
    note:
      flexSlots > 0
        ? `This format has ${flexSlots} FLEX/SUPER_FLEX slot(s), so RB/WR/TE depth matters beyond listed starter minimums.`
        : "No FLEX/SUPER_FLEX slots were detected in the roster settings.",
  };
}

function countRosterPositions(
  userTeam: DraftState["teams"][number] | null,
  playersById: Map<string, Player>,
): Record<Position, number> {
  const counts: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DEF: 0,
  };

  for (const playerId of userTeam?.roster ?? []) {
    const player = playersById.get(playerId);
    if (player) {
      counts[player.position] += 1;
    }
  }

  return counts;
}

function describePlayerValueSource(sources: Set<Player["projectionSource"]>): string {
  if (sources.has("imported")) {
    return "Imported rankings are the primary player-value signal. Treat them as rankings/scaffolding unless true projections are imported later.";
  }

  if (sources.has("sleeper_search_rank")) {
    return "Sleeper search-rank metadata is the temporary player-value signal. This is placeholder ordering, not projections.";
  }

  return "Demo/mock projections are the player-value signal.";
}

function getDataLimitations(sources: Set<Player["projectionSource"]>): string[] {
  if (sources.has("sleeper_search_rank")) {
    return [
      "Sleeper does not expose full fantasy projections through the draft API.",
      "Placeholder ranks should be treated as board scaffolding, not confident pick advice.",
    ];
  }

  if (sources.has("imported")) {
    return [
      "Imported FantasyPros ranks provide draft ordering and tiers, but not a full live projection model.",
      "Do not claim the AI provider is disconnected unless an explicit error says so.",
    ];
  }

  return ["Demo data is useful for UI testing only."];
}

function playerSummary(player: Player | undefined, fallbackId: string) {
  return {
    id: player?.id ?? fallbackId,
    name: player?.name ?? fallbackId,
    team: player?.team ?? "?",
    position: player?.position ?? "?",
  };
}





