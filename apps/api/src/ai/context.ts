import type { DraftRecommendation, DraftState, Player, Position } from "@sleeper-draft-assistant/shared";

import { buildNeutralInitialPlayerPool, createDraftPlayerSnapshot, type DraftPlayerSnapshot } from "./draft-tools";
import type { AiConversationMessage, DraftAiContext, DraftStrategyContext, PlayerPreferenceSummary } from "./types";

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
    limitations: [
      ...getDataLimitations(candidateSources),
      ...(state.settings.formatCompatibility?.warnings ?? []),
    ],
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

export function buildDraftStrategyContext(
  state: DraftState,
  userPreferences: PlayerPreferenceSummary = { pinned: [], faded: [], excluded: [] },
  snapshot: DraftPlayerSnapshot = createDraftPlayerSnapshot(state, userPreferences),
): DraftStrategyContext {
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  const userTeam = state.teams.find((team) => team.id === state.userTeamId);
  if (!userTeam) {
    throw new Error("The user's draft team is not available.");
  }
  const positionCounts = countRosterPositions(userTeam, playersById);
  const openDirectStarterSlots = getOpenDirectStarterSlots(state, positionCounts);
  const nextUserPick = findNextUserPick(state);
  const recentPicks = [...state.picks].reverse().slice(0, 12);
  const availablePlayers = snapshot.players.filter((player) => !snapshot.preferences.excluded.has(player.id));

  return {
    task: "draft_strategy",
    objective: "Choose the best available player for the user's roster at the current pick.",
    userPreferences,
    dataQuality: {
      availablePlayers: availablePlayers.length,
      rankedPlayers: availablePlayers.filter((player) => player.importedRank != null).length,
      projectedPlayers: availablePlayers.filter((player) => player.seasonProjectedPoints != null || player.projectionSource === "season_projection").length,
      sleeperAdpPlayers: availablePlayers.filter((player) => Boolean(player.adpSource) && player.adp != null).length,
      realTimeAdpPlayers: availablePlayers.filter((player) => player.realTimeAdp != null).length,
      usesSleeperPlaceholderRanks: availablePlayers.some((player) => player.projectionSource === "sleeper_search_rank"),
      formatWarnings: state.settings.formatCompatibility?.warnings ?? [],
    },
    draft: {
      id: state.id,
      name: state.name,
      status: state.status,
      currentPick: state.currentPick,
      nextUserPick,
      picksUntilNextUserPick: nextUserPick === null ? null : nextUserPick - state.currentPick,
      remainingUserSelections: countUserPicksFrom(state, state.currentPick),
      updatedAt: state.updatedAt,
    },
    settings: state.settings,
    roster: {
      teamId: userTeam.id,
      teamName: userTeam.name,
      draftSlot: userTeam.draftSlot,
      positionCounts,
      openDirectStarterSlots,
      openFlexSlots: getOpenFlexSlots(state, positionCounts),
      openSuperFlexSlots: getOpenSuperFlexSlots(state, positionCounts),
      players: userTeam.roster.flatMap((playerId) => {
        const player = playersById.get(playerId);
        return player ? [{
          playerId,
          name: player.name,
          team: player.team,
          position: player.position,
          byeWeek: player.byeWeek ?? null,
        }] : [];
      }),
    },
    board: {
      recentPicks: recentPicks.map((pick) => ({
        pickNo: pick.pickNo,
        round: pick.round,
        team: teamsById.get(pick.teamId)?.name ?? pick.teamId,
        player: playersById.get(pick.playerId)?.name ?? pick.playerId,
        position: playersById.get(pick.playerId)?.position ?? null,
      })),
      draftedByPosition: countPickedPositions(state.picks, playersById),
      recentDraftedByPosition: countPickedPositions(recentPicks, playersById),
      availableByPosition: countPlayerPositions(availablePlayers),
      teamsSelectingBeforeNextTurn: getTeamsSelectingBeforeNextTurn(state, nextUserPick, playersById),
    },
    initialPlayerPool: buildNeutralInitialPlayerPool(snapshot, openDirectStarterSlots),
    toolInstructions: [
      "The initial player pool is a neutral union of raw ECR, projection, ADP, open-position, and pinned-player results; its order is not a recommendation.",
      "Use search_available_players whenever another position, tier, or named player could materially change the decision.",
      "Tool results are from the immutable player pool captured at draft.currentPick.",
      "Treat imported rank, season projection, Sleeper ADP, and Real-Time ADP as separate evidence.",
    ],
  };
}

function getOpenDirectStarterSlots(
  state: DraftState,
  counts: Record<Position, number>,
): Record<Position, number> {
  const slots = state.settings.rosterSlots;
  return {
    QB: Math.max(0, (slots.QB ?? 0) - counts.QB),
    RB: Math.max(0, (slots.RB ?? 0) - counts.RB),
    WR: Math.max(0, (slots.WR ?? 0) - counts.WR),
    TE: Math.max(0, (slots.TE ?? 0) - counts.TE),
    K: Math.max(0, (slots.K ?? 0) - counts.K),
    DEF: Math.max(0, (slots.DEF ?? 0) - counts.DEF),
  };
}

function getOpenSuperFlexSlots(state: DraftState, counts: Record<Position, number>): number {
  const slots = state.settings.rosterSlots;
  const superFlexSlots = (slots.SUPER_FLEX ?? 0) + (slots.SF ?? 0);
  const regularFlexSlots = (slots.FLEX ?? 0) + (slots.WR_RB_FLEX ?? 0) + (slots.REC_FLEX ?? 0);
  const rbWrTeSurplus =
    Math.max(0, counts.RB - (slots.RB ?? 0)) +
    Math.max(0, counts.WR - (slots.WR ?? 0)) +
    Math.max(0, counts.TE - (slots.TE ?? 0));
  const qbSurplus = Math.max(0, counts.QB - (slots.QB ?? 0));
  const surplusAfterRegularFlex = qbSurplus + Math.max(0, rbWrTeSurplus - regularFlexSlots);
  return Math.max(0, superFlexSlots - surplusAfterRegularFlex);
}

function getOpenFlexSlots(state: DraftState, counts: Record<Position, number>): number {
  const slots = state.settings.rosterSlots;
  const flexSlots = (slots.FLEX ?? 0) + (slots.WR_RB_FLEX ?? 0) + (slots.REC_FLEX ?? 0);
  const surplus =
    Math.max(0, counts.RB - (slots.RB ?? 0)) +
    Math.max(0, counts.WR - (slots.WR ?? 0)) +
    Math.max(0, counts.TE - (slots.TE ?? 0));
  return Math.max(0, flexSlots - surplus);
}

function findNextUserPick(state: DraftState): number | null {
  const userSlot = state.teams.find((team) => team.id === state.userTeamId)?.draftSlot;
  if (!userSlot) {
    return null;
  }
  const currentSlot = draftSlotForPick(state.currentPick, state.settings.teams);
  const start = currentSlot === userSlot ? state.currentPick + 1 : state.currentPick;
  const totalPicks = state.settings.teams * state.settings.rounds;
  for (let pickNo = start; pickNo <= totalPicks; pickNo += 1) {
    if (draftSlotForPick(pickNo, state.settings.teams) === userSlot) {
      return pickNo;
    }
  }
  return null;
}

function countUserPicksFrom(state: DraftState, fromPick: number): number {
  const userSlot = state.teams.find((team) => team.id === state.userTeamId)?.draftSlot;
  if (!userSlot) {
    return 0;
  }
  let count = 0;
  for (let pickNo = fromPick; pickNo <= state.settings.teams * state.settings.rounds; pickNo += 1) {
    if (draftSlotForPick(pickNo, state.settings.teams) === userSlot) {
      count += 1;
    }
  }
  return count;
}

function draftSlotForPick(pickNo: number, teams: number): number {
  const round = Math.ceil(pickNo / teams);
  const pickInRound = ((pickNo - 1) % teams) + 1;
  return round % 2 === 1 ? pickInRound : teams + 1 - pickInRound;
}

function countPickedPositions(
  picks: DraftState["picks"],
  playersById: Map<string, Player>,
): Record<Position, number> {
  return countPlayerPositions(
    picks.map((pick) => playersById.get(pick.playerId)).filter((player): player is Player => Boolean(player)),
  );
}

function countPlayerPositions(players: Player[]): Record<Position, number> {
  const counts = emptyPositionCounts();
  for (const player of players) {
    counts[player.position] += 1;
  }
  return counts;
}

function emptyPositionCounts(): Record<Position, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
}

function getTeamsSelectingBeforeNextTurn(
  state: DraftState,
  nextUserPick: number | null,
  playersById: Map<string, Player>,
): DraftStrategyContext["board"]["teamsSelectingBeforeNextTurn"] {
  if (nextUserPick === null) {
    return [];
  }
  const teamsBySlot = new Map(state.teams.map((team) => [team.draftSlot, team]));
  const selected = new Map<string, DraftStrategyContext["board"]["teamsSelectingBeforeNextTurn"][number]>();
  for (let pickNo = state.currentPick; pickNo < nextUserPick; pickNo += 1) {
    const team = teamsBySlot.get(draftSlotForPick(pickNo, state.settings.teams));
    if (!team || team.id === state.userTeamId || selected.has(team.id)) {
      continue;
    }
    selected.set(team.id, {
      team: team.name,
      draftSlot: team.draftSlot,
      positionCounts: countRosterPositions(team, playersById),
    });
  }
  return [...selected.values()];
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

  for (const [position, counterpart] of [["WR", "RB"], ["RB", "WR"]] as const) {
    const maximumStartingCapacity = (state.settings.rosterSlots[position] ?? 0) + flexSlots;
    const counterpartGap = Math.max(
      0,
      (state.settings.rosterSlots[counterpart] ?? 0) - counts[counterpart],
    );
    if (maximumStartingCapacity > 0 && counts[position] >= maximumStartingCapacity && counterpartGap > 0) {
      signals.push(
        `${position} has filled all ${maximumStartingCapacity} possible direct/FLEX starting spots while ${counterpart} still has ${counterpartGap} open direct starter spot(s).`,
      );
    }
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


