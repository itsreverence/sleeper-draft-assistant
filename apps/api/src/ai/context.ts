import type { DraftRecommendation, DraftState, Player, Position } from "@sleeper-draft-assistant/shared";

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
  const dataQuality: DraftAiContext["dataQuality"] = {
    playerValueSource: describePlayerValueSource(candidateSources),
    hasImportedRankings: recommendation.candidates.some((candidate) => candidate.player.importedRank !== null && candidate.player.importedRank !== undefined),
    hasSeasonProjections: candidateSources.has("season_projection"),
    usesSleeperPlaceholderRanks: candidateSources.has("sleeper_search_rank"),
    limitations: getDataLimitations(candidateSources),
  };
  const rosterConstruction = buildRosterConstruction(state, userTeam, playersById);
  const userTeamSummary: DraftAiContext["userTeam"] = userTeam
    ? {
        id: userTeam.id,
        name: userTeam.name,
        draftSlot: userTeam.draftSlot,
        roster: userTeam.roster.map((playerId) => playerSummary(playersById.get(playerId), playerId)),
      }
    : null;
  const recentPicks: DraftAiContext["recentPicks"] = [...state.picks]
    .reverse()
    .slice(0, 12)
    .map((pick) => ({
      pickNo: pick.pickNo,
      round: pick.round,
      team: teamsById.get(pick.teamId)?.name ?? pick.teamId,
      player: playersById.get(pick.playerId)?.name ?? pick.playerId,
    }));
  const recommendationSummary: DraftAiContext["recommendation"] = {
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
      seasonProjectedPoints: candidate.player.seasonProjectedPoints ?? null,
      sleeperAdp: candidate.player.adpSource ? candidate.player.adp : null,
      realTimeAdp: candidate.player.realTimeAdp ?? null,
      tier: candidate.player.tier,
      byeWeek: candidate.player.byeWeek ?? null,
      riskTags: candidate.player.riskTags,
    })),
    risks: recommendation.risks,
    assumptions: recommendation.assumptions,
  };

  return {
    task: "draft_question",
    question,
    conversationHistory: conversationHistory.slice(-8),
    userPreferences,
    dataQuality,
    draftBrief: buildDraftBrief(state, userTeamSummary, rosterConstruction, recommendationSummary, dataQuality),
    draft: {
      id: state.id,
      name: state.name,
      status: state.status,
      currentPick: state.currentPick,
      updatedAt: state.updatedAt,
    },
    settings: state.settings,
    rosterConstruction,
    userTeam: userTeamSummary,
    recentPicks,
    recommendation: recommendationSummary,
  };
}

function buildDraftBrief(
  state: DraftState,
  userTeam: DraftAiContext["userTeam"],
  rosterConstruction: DraftAiContext["rosterConstruction"],
  recommendation: DraftAiContext["recommendation"],
  dataQuality: DraftAiContext["dataQuality"],
): DraftAiContext["draftBrief"] {
  const top = recommendation.candidates[0] ?? null;
  const alternatives = recommendation.candidates.slice(1, 4);
  const rosterNames = userTeam?.roster.map((player) => `${player.name} (${player.position})`) ?? [];
  const scoring = state.settings.scoring || "Unknown scoring";
  const leagueFormat = `${state.settings.teams}-team ${scoring}, ${state.settings.rounds} rounds, slots ${formatRosterSlots(state.settings.rosterSlots)}`;
  const primaryDecisionGuidance = buildPrimaryDecisionGuidance(rosterConstruction, recommendation, dataQuality);
  const candidateTradeoffs = [top, ...alternatives]
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .map((candidate, index) => {
      const label = index === 0 ? "Engine lean" : "Alternative";
      return `${label}: ${candidate.name} (${candidate.position}) - score ${candidate.score}, ${candidate.value}, ${candidate.scarcity}, ${Math.round(candidate.returnProbability * 100)}% return chance; reasons: ${candidate.reasons.join("; ") || "none"}.`;
    });

  return {
    leagueFormat,
    currentPick: `Pick ${state.currentPick}, draft status ${state.status}.`,
    userRoster: rosterNames.length > 0 ? rosterNames.join(", ") : "No players drafted for the user roster yet.",
    engineLean: top
      ? `${top.name} (${top.position}) with ${recommendation.confidence} confidence: ${recommendation.summary}`
      : "No deterministic engine candidate is currently available.",
    primaryDecisionGuidance,
    rosterPressure: rosterConstruction.pressureSignals,
    candidateTradeoffs,
    dataWarnings: dataQuality.limitations,
    responseRules: [
      "Answer the user's exact question first, then explain the tradeoff.",
      "If roster need conflicts with the engine lean, call out the conflict instead of pretending they agree.",
      "Use imported rankings as ranks/tiers only; do not call them projections unless true projections are present.",
      "Mention user-pinned, faded, or excluded players when those preferences affect the answer.",
      "Keep the answer short enough for a live draft clock.",
    ],
  };
}

function buildPrimaryDecisionGuidance(
  rosterConstruction: DraftAiContext["rosterConstruction"],
  recommendation: DraftAiContext["recommendation"],
  dataQuality: DraftAiContext["dataQuality"],
): string[] {
  const guidance: string[] = [];
  const top = recommendation.candidates[0];

  if (top) {
    guidance.push(`Start from the deterministic engine lean, ${top.name}, but test it against roster construction and data quality.`);
  }

  if (rosterConstruction.primaryNeeds.length > 0) {
    guidance.push(`Open starter needs: ${rosterConstruction.primaryNeeds.join(", ")}.`);
  }

  if (rosterConstruction.flexSlots > 0) {
    guidance.push("RB/WR depth has extra importance because FLEX slots increase weekly starter demand.");
  }

  if (rosterConstruction.superFlexSlots > 0) {
    guidance.push("QB demand is elevated because this is a superflex format.");
  } else if ((rosterConstruction.startingSlots.QB ?? 0) <= 1) {
    guidance.push("QB replacement pressure is lower because this is not a superflex format.");
  }

  if (dataQuality.hasSeasonProjections) {
    guidance.push("Season projections provide the primary point and replacement-value signal; imported rankings remain a separate expert-opinion signal.");
  } else if (dataQuality.hasImportedRankings) {
    guidance.push("Imported rankings can support board value and tier decisions, but they are not a full projection model.");
  } else if (dataQuality.usesSleeperPlaceholderRanks) {
    guidance.push("Sleeper placeholder ranks are scaffolding only, so avoid overconfident advice.");
  }

  return guidance;
}

function formatRosterSlots(slots: Record<string, number>): string {
  return Object.entries(slots)
    .filter(([, count]) => count > 0)
    .map(([slot, count]) => `${slot}:${count}`)
    .join("/");
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
  const flexSlots = (state.settings.rosterSlots.FLEX ?? 0) + (state.settings.rosterSlots.WR_RB_FLEX ?? 0) + (state.settings.rosterSlots.REC_FLEX ?? 0);
  const superFlexSlots = (state.settings.rosterSlots.SUPER_FLEX ?? 0) + (state.settings.rosterSlots.SF ?? 0);
  const draftedFlexEligible = counts.RB + counts.WR + counts.TE;
  const rbWrDemand = (state.settings.rosterSlots.RB ?? 0) + (state.settings.rosterSlots.WR ?? 0) + flexSlots;
  const rbWrRostered = counts.RB + counts.WR;
  const pressureSignals = buildRosterPressureSignals(state, counts, flexSlots, superFlexSlots, rbWrDemand, rbWrRostered);

  return {
    rosterCounts: counts,
    startingSlots: state.settings.rosterSlots,
    flexSlots,
    superFlexSlots,
    draftedFlexEligible,
    rbWrDemand,
    rbWrRostered,
    primaryNeeds: needs.filter((need) => need.stillNeedsStarter).map((need) => need.position),
    pressureSignals,
    note:
      pressureSignals.length > 0
        ? pressureSignals.join(" ")
        : "No unusual roster-construction pressure was detected from the current settings.",
  };
}

function buildRosterPressureSignals(
  state: DraftState,
  counts: Record<Position, number>,
  flexSlots: number,
  superFlexSlots: number,
  rbWrDemand: number,
  rbWrRostered: number,
): string[] {
  const signals: string[] = [];

  if (flexSlots > 0) {
    signals.push(`This format has ${flexSlots} RB/WR/TE FLEX slot(s), increasing RB/WR depth pressure.`);
  }

  if (superFlexSlots > 0) {
    signals.push(`This format has ${superFlexSlots} SUPER_FLEX slot(s), increasing QB demand.`);
  } else if ((state.settings.rosterSlots.QB ?? 0) <= 1 && state.settings.teams <= 10) {
    signals.push("This is a shallow one-QB league, so QB replacement pressure is lower than in deeper or superflex formats.");
  }

  if (rbWrRostered < rbWrDemand) {
    signals.push(`Current RB/WR count is ${rbWrRostered} against ${rbWrDemand} starter-plus-flex demand.`);
  }

  if (state.settings.scoring.toLowerCase().includes("ppr")) {
    signals.push("PPR scoring increases the importance of pass-catching RB/WR volume.");
  }

  if (counts.TE >= (state.settings.rosterSlots.TE ?? 0) && (state.settings.rosterSlots.TE ?? 0) > 0) {
    signals.push("TE starter need is already covered on the current roster.");
  }

  return signals;
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
  if (sources.has("season_projection")) {
    return "FantasyPros season projections are scored against the connected Sleeper format; ECR and Sleeper ADP remain separate expert and market signals.";
  }

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

  if (sources.has("season_projection")) {
    return [
      "Season projections cover expected volume, not injuries, depth-chart changes, or live news.",
      "Kicker and defense scoring may be approximate when exports lack field-goal distance or per-game points-allowed detail.",
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


