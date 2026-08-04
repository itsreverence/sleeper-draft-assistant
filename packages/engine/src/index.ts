import type {
  DraftOption,
  DraftRecommendation,
  DraftState,
  Pick,
  Player,
  Position,
  Team,
  TeamDataReadiness,
  TeamLineupAssignment,
  TeamLineupSummary,
  TeamManagerState,
  TeamNeedsSummary,
  TeamPositionNeed,
  TeamWaiverSummary,
  WeeklyProjectionImportSummary,
} from "@sleeper-draft-assistant/shared";

export type DraftRecommendationPreferences = {
  pinnedPlayerIds?: string[];
  fadedPlayerIds?: string[];
  excludedPlayerIds?: string[];
};

export type DraftRecommendationOptions = {
  preferences?: DraftRecommendationPreferences;
  candidateLimit?: number;
};


const teamNeedPositions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];



export function buildTeamLineupSummary(state: TeamManagerState): TeamLineupSummary {
  const rosterPlayers = getUniqueRosterPlayers(state);
  const lockedStarters: Player[] = [];
  const riskyStarters: Player[] = [];
  const decisions = buildLineupDecisions(state, rosterPlayers);
  const openSlots = decisions.filter((decision) => decision.status === "open" || decision.status === "thin").map((decision) => decision.slot);
  const swapRecommendations = decisions.filter((decision) => decision.status === "swap_recommended");
  const currentProjectionCoverage = getLineupProjectionCoverage(decisions, "current");
  const recommendedProjectionCoverage = getLineupProjectionCoverage(decisions, "recommended");
  const currentProjectedPoints = getLineupProjectedTotal(decisions, "current");
  const recommendedProjectedPoints = getLineupProjectedTotal(decisions, "recommended");
  const projectedPointDelta = currentProjectedPoints !== null && recommendedProjectedPoints !== null
    ? roundPoints(recommendedProjectedPoints - currentProjectedPoints)
    : null;

  for (const decision of decisions) {
    if (decision.status === "locked" && decision.currentPlayer) {
      lockedStarters.push(decision.currentPlayer);
    }
    const starter = decision.recommendedPlayer ?? decision.currentPlayer;
    if (starter?.riskTags.length) {
      riskyStarters.push(starter);
    }
  }

  return {
    headline: buildLineupHeadline(openSlots, swapRecommendations, projectedPointDelta),
    confidence: getLineupSummaryConfidence(decisions, recommendedProjectionCoverage),
    decisions,
    lockedStarters,
    openSlots,
    swapRecommendations,
    riskyStarters: Array.from(new Map(riskyStarters.map((player) => [player.id, player])).values()),
    currentProjectedPoints,
    recommendedProjectedPoints,
    projectedPointDelta,
    currentProjectionCoverage,
    recommendedProjectionCoverage,
    facts: buildLineupFacts(decisions, openSlots, swapRecommendations, currentProjectedPoints, recommendedProjectedPoints, projectedPointDelta),
    limitations: buildLineupLimitations(rosterPlayers),
  };
}

export function buildTeamDataReadiness(
  state: TeamManagerState,
  weeklyProjectionSummary: WeeklyProjectionImportSummary | null,
): TeamDataReadiness {
  const eligibleRosterPlayers = getUniqueActiveRosterPlayers(state);
  const relevantPositions = teamNeedPositions.filter((position) =>
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

  if (!weeklyProjectionSummary) {
    warnings.push("No weekly projection import is loaded for this team view.");
  } else {
    facts.push(`FantasyPros ${weeklyProjectionSummary.season} Week ${weeklyProjectionSummary.week} was imported ${weeklyProjectionSummary.appliedAt}.`);
    warnings.push("Weekly FPTS are provider-scored; confirm the FantasyPros export uses this league's scoring format.");
    if (state.league.season && weeklyProjectionSummary.season !== state.league.season) {
      warnings.push(`Imported projections are for ${weeklyProjectionSummary.season}, but this league is ${state.league.season}.`);
    }
    if (missingPositions.length > 0) {
      warnings.push(`Missing projection files for ${missingPositions.join(", ")}.`);
    }
    if (importMatchRate !== null && importMatchRate < 0.85) {
      warnings.push(`Only ${Math.round(importMatchRate * 100)}% of imported rows matched Sleeper players.`);
    }
  }

  facts.push(`${projectedRosterPlayers}/${eligibleRosterPlayers.length} active roster players have projections for the selected import.`);
  if (rosterProjectionCoverage < 0.8 && eligibleRosterPlayers.length > 0) {
    warnings.push(`Roster projection coverage is ${Math.round(rosterProjectionCoverage * 100)}%; lineup totals may be incomplete.`);
  }

  const importIsCurrent = Boolean(
    weeklyProjectionSummary
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
      ? "Weekly data is ready for lineup decisions."
      : status === "partial"
        ? "Weekly data is usable with coverage gaps."
        : "Weekly advice is using limited data.",
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
export function buildTeamWaiverSummary(state: TeamManagerState, availablePlayers: Player[]): TeamWaiverSummary {
  const teamNeeds = buildTeamNeedsSummary(state);
  const rosterPlayers = getUniqueRosterPlayers(state);
  const dropCandidates = buildDropCandidates(state, rosterPlayers);
  const topDrop = dropCandidates[0]?.player ?? null;
  const candidates = availablePlayers
    .filter((player) => isFantasyStarterPosition(player.position))
    .map((player) => buildWaiverCandidate(player, teamNeeds, rosterPlayers, topDrop))
    .sort((a, b) => b.score - a.score || comparePlayersForLineup(a.player, b.player))
    .slice(0, 12);
  const topCandidate = candidates[0] ?? null;

  return {
    headline: topCandidate
      ? `Top available signal: ${topCandidate.player.name} (${topCandidate.player.team} ${topCandidate.player.position}).`
      : "No clear waiver candidates are available from the loaded Sleeper player pool.",
    candidates,
    dropCandidates,
    facts: buildWaiverFacts(availablePlayers, candidates, dropCandidates, teamNeeds),
    limitations: buildWaiverLimitations([...availablePlayers, ...rosterPlayers]),
  };
}
export function buildTeamNeedsSummary(state: TeamManagerState): TeamNeedsSummary {
  const rosterPlayers = getUniqueRosterPlayers(state);
  const lineup = buildDeterministicLineup(state, rosterPlayers);
  const openStarterSlots = lineup.filter((assignment) => !assignment.player).map((assignment) => assignment.slot);
  const positionNeeds = buildPositionNeeds(state, rosterPlayers);
  const weakestPositions = positionNeeds
    .filter((need) => need.priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map((need) => need.position);
  const thinPositions = positionNeeds.filter((need) => need.status === "open_starter" || need.status === "thin_depth").map((need) => need.position);
  const surplusPositions = positionNeeds.filter((need) => need.status === "surplus").map((need) => need.position);
  const flexPressure = describeFlexPressure(state);
  const facts = buildTeamFacts(state, openStarterSlots, positionNeeds, flexPressure);

  return {
    headline: weakestPositions.length > 0
      ? `Prioritize ${weakestPositions.join("/")} based on current roster structure.`
      : "No urgent roster-structure weakness is visible from Sleeper data alone.",
    weakestPositions,
    openStarterSlots,
    thinPositions,
    surplusPositions,
    flexPressure,
    lineup,
    positionNeeds,
    facts,
    limitations: [
      "This team-needs summary uses Sleeper roster structure and player metadata, not weekly projections.",
      "Lineup assignment is deterministic scaffolding and does not account for matchups, injuries beyond Sleeper status tags, or news.",
    ],
  };
}




function buildLineupLimitations(rosterPlayers: Player[]): string[] {
  const hasWeeklyProjections = rosterPlayers.some((player) => player.projectionSource === "weekly_projection");
  return [
    hasWeeklyProjections
      ? "Lineup decisions use imported weekly projections when matched, plus roster metadata and risk tags."
      : "Lineup decisions use roster metadata and imported ranks when present, not weekly projections or player news.",
    "Sleeper current starter slots are treated as the current lineup baseline.",
    hasWeeklyProjections
      ? "Flex choices are ranked deterministically by weekly projected points, estimated value, and risk tags."
      : "Flex choices are ranked deterministically by imported rank, estimated value, and risk tags.",
  ];
}

function buildWaiverLimitations(players: Player[]): string[] {
  const hasWeeklyProjections = players.some((player) => player.projectionSource === "weekly_projection");
  const hasRosRankings = players.some((player) => player.rosRank !== null && player.rosRank !== undefined);
  return [
    hasWeeklyProjections && hasRosRankings
      ? "Waiver candidates combine imported weekly projections with rest-of-season ECR, Sleeper availability, and roster needs."
      : hasWeeklyProjections
        ? "Waiver candidates use imported weekly projections when matched, plus Sleeper availability and roster metadata."
        : hasRosRankings
          ? "Waiver candidates use rest-of-season ECR, Sleeper availability, and roster needs without current-week projections."
      : "Waiver candidates use available Sleeper player metadata and imported rankings when present, not real-time projections or news.",
    "Availability is inferred from players not currently present on Sleeper league rosters.",
    "Drop suggestions are deterministic roster-shape signals and should be reviewed before making real moves.",
  ];
}

function buildLineupDecisions(state: TeamManagerState, rosterPlayers: Player[]): TeamLineupSummary["decisions"] {
  const remaining = new Map(rosterPlayers.map((player) => [player.id, player]));
  const orderedSlots = [
    ...state.roster.starters.filter((slot) => !isFlexSlot(slot.slot)),
    ...state.roster.starters.filter((slot) => isFlexSlot(slot.slot)),
  ];
  const decisions: TeamLineupSummary["decisions"] = [];

  for (const slot of orderedSlots) {
    const decision = buildLineupDecision(slot, Array.from(remaining.values()));
    decisions.push(decision);
    if (decision.recommendedPlayer) {
      remaining.delete(decision.recommendedPlayer.id);
    }
    if (decision.status === "locked" && decision.currentPlayer) {
      remaining.delete(decision.currentPlayer.id);
    }
  }

  return decisions;
}

function buildLineupDecision(slot: TeamManagerState["roster"]["starters"][number], rosterPlayers: Player[]): TeamLineupSummary["decisions"][number] {
  const eligible = rosterPlayers.filter((player) => slot.eligiblePositions.includes(player.position)).sort(comparePlayersForLineup);
  const currentPlayer = slot.player;
  const recommendedPlayer = eligible[0] ?? null;
  const alternatives = eligible.filter((player) => player.id !== recommendedPlayer?.id).slice(0, 3);
  const currentProjectedPoints = currentPlayer ? getWeeklyProjectedPoints(currentPlayer) : 0;
  const recommendedProjectedPoints = recommendedPlayer ? getWeeklyProjectedPoints(recommendedPlayer) : null;
  const projectedPointDelta = currentProjectedPoints !== null && recommendedProjectedPoints !== null
    ? roundPoints(recommendedProjectedPoints - currentProjectedPoints)
    : null;
  const reasons: string[] = [];
  let status: TeamLineupSummary["decisions"][number]["status"] = "locked";
  let confidence: TeamLineupSummary["decisions"][number]["confidence"] = "medium";

  if (!recommendedPlayer) {
    status = "thin";
    confidence = "low";
    reasons.push(`No rostered player is eligible for ${slot.slot}.`);
  } else if (!currentPlayer) {
    status = "open";
    confidence = recommendedProjectedPoints !== null ? "high" : getPlayerSignalConfidence(recommendedPlayer);
    reasons.push(`${slot.slot} is open; ${recommendedPlayer.name} is the top eligible option.`);
  } else if (recommendedPlayer.id !== currentPlayer.id && comparePlayersForLineup(recommendedPlayer, currentPlayer) < 0) {
    if (projectedPointDelta !== null) {
      if (projectedPointDelta >= 0.5) {
        status = "swap_recommended";
        confidence = projectedPointDelta >= 3 ? "high" : projectedPointDelta >= 1 ? "medium" : "low";
        reasons.push(`${recommendedPlayer.name} projects ${projectedPointDelta.toFixed(1)} points ahead of current starter ${currentPlayer.name}.`);
      } else {
        confidence = "low";
        reasons.push(`${recommendedPlayer.name} and ${currentPlayer.name} are within 0.5 projected points; treat this as a toss-up.`);
      }
    } else {
      status = "swap_recommended";
      confidence = getPlayerSignalConfidence(recommendedPlayer);
      reasons.push(`${recommendedPlayer.name} has a stronger deterministic value signal than current starter ${currentPlayer.name}.`);
      reasons.push("A weekly point delta is unavailable because both players do not have matched weekly projections.");
    }
  } else {
    reasons.push(`${currentPlayer.name} remains the top eligible ${slot.slot} option by current metadata.`);
    confidence = getPlayerSignalConfidence(currentPlayer);
  }

  if (recommendedPlayer?.projectionSource === "weekly_projection" && recommendedPlayer.weeklyProjectedPoints !== null && recommendedPlayer.weeklyProjectedPoints !== undefined) {
    reasons.push(`Recommended option has FantasyPros Week ${recommendedPlayer.weeklyProjectionWeek ?? "?"} projection of ${recommendedPlayer.weeklyProjectedPoints.toFixed(1)} points.`);
  } else if (recommendedPlayer?.rosRank) {
    reasons.push(`Recommended option has FantasyPros ROS rank ${recommendedPlayer.rosRank}.`);
  } else if (recommendedPlayer?.importedRank) {
    reasons.push(`Recommended option has imported rank ${recommendedPlayer.importedRank}${recommendedPlayer.tier ? `, tier ${recommendedPlayer.tier}` : ""}.`);
  }
  if (recommendedPlayer?.riskTags.length) {
    confidence = confidence === "high" ? "medium" : "low";
    reasons.push(`Risk tags: ${recommendedPlayer.riskTags.join(", ")}.`);
  }

  return {
    slot: slot.slot,
    currentPlayer,
    recommendedPlayer,
    alternativePlayers: alternatives,
    status,
    confidence,
    currentProjectedPoints,
    recommendedProjectedPoints,
    projectedPointDelta,
    reasons,
  };
}

function buildLineupHeadline(
  openSlots: string[],
  swaps: TeamLineupSummary["swapRecommendations"],
  projectedPointDelta: number | null,
): string {
  if (swaps.length > 0) {
    return projectedPointDelta !== null && projectedPointDelta > 0
      ? `${swaps.length} lineup swap${swaps.length === 1 ? "" : "s"} can add ${projectedPointDelta.toFixed(1)} projected points.`
      : `${swaps.length} lineup swap${swaps.length === 1 ? "" : "s"} recommended.`;
  }
  if (openSlots.length > 0) {
    return `${openSlots.length} starter slot${openSlots.length === 1 ? " is" : "s are"} open.`;
  }
  return "No immediate lineup change is recommended from current metadata.";
}

function buildLineupFacts(
  decisions: TeamLineupSummary["decisions"],
  openSlots: string[],
  swaps: TeamLineupSummary["swapRecommendations"],
  currentProjectedPoints: number | null,
  recommendedProjectedPoints: number | null,
  projectedPointDelta: number | null,
): string[] {
  const facts: string[] = [];
  if (currentProjectedPoints !== null && recommendedProjectedPoints !== null && projectedPointDelta !== null) {
    facts.push(`Current lineup projects for ${currentProjectedPoints.toFixed(1)} points; optimized lineup projects for ${recommendedProjectedPoints.toFixed(1)} (${projectedPointDelta >= 0 ? "+" : ""}${projectedPointDelta.toFixed(1)}).`);
  }
  if (openSlots.length) {
    facts.push(`Open lineup slots: ${openSlots.join(", ")}.`);
  }
  for (const swap of swaps.slice(0, 3)) {
    if (swap.currentPlayer && swap.recommendedPlayer) {
      facts.push(`Consider ${swap.recommendedPlayer.name} over ${swap.currentPlayer.name} at ${swap.slot}.`);
    }
  }
  const risky = decisions.flatMap((decision) => [decision.recommendedPlayer ?? decision.currentPlayer]).filter(isPlayer).filter((player) => player.riskTags.length > 0);
  if (risky.length) {
    facts.push(`Risk flags in lineup: ${Array.from(new Set(risky.map((player) => player.name))).join(", ")}.`);
  }
  if (!facts.length) {
    facts.push("Current starters align with deterministic roster metadata.");
  }
  return facts;
}

function getLineupProjectionCoverage(
  decisions: TeamLineupSummary["decisions"],
  lineup: "current" | "recommended",
): number {
  if (decisions.length === 0) {
    return 0;
  }
  const projected = decisions.filter((decision) =>
    lineup === "current"
      ? decision.currentPlayer !== null && decision.currentProjectedPoints !== null
      : decision.recommendedPlayer !== null && decision.recommendedProjectedPoints !== null,
  ).length;
  return projected / decisions.length;
}

function getLineupProjectedTotal(
  decisions: TeamLineupSummary["decisions"],
  lineup: "current" | "recommended",
): number | null {
  if (decisions.length === 0 || getLineupProjectionCoverage(decisions, lineup) < 1) {
    return null;
  }
  return roundPoints(decisions.reduce((total, decision) =>
    total + (lineup === "current" ? decision.currentProjectedPoints ?? 0 : decision.recommendedProjectedPoints ?? 0), 0));
}

function getLineupSummaryConfidence(
  decisions: TeamLineupSummary["decisions"],
  recommendedProjectionCoverage: number,
): TeamLineupSummary["confidence"] {
  if (recommendedProjectionCoverage === 1 && decisions.every((decision) => decision.confidence !== "low")) {
    return decisions.some((decision) => decision.confidence === "medium") ? "medium" : "high";
  }
  if (recommendedProjectionCoverage > 0 && decisions.some((decision) => decision.confidence !== "low")) {
    return "medium";
  }
  return "low";
}

function getPlayerSignalConfidence(player: Player): TeamLineupSummary["confidence"] {
  if (getWeeklyProjectedPoints(player) !== null) {
    return "high";
  }
  if (player.rosRank || player.projectionSource === "imported" || player.importedRank) {
    return "medium";
  }
  return "low";
}

function getWeeklyProjectedPoints(player: Player): number | null {
  return player.projectionSource === "weekly_projection"
    && player.weeklyProjectedPoints !== null
    && player.weeklyProjectedPoints !== undefined
    ? player.weeklyProjectedPoints
    : null;
}

function roundPoints(points: number): number {
  return Math.round(points * 10) / 10;
}
function buildWaiverCandidate(player: Player, teamNeeds: TeamNeedsSummary, rosterPlayers: Player[], suggestedDrop: Player | null): TeamWaiverSummary["candidates"][number] {
  const need = teamNeeds.positionNeeds.find((item) => item.position === player.position);
  const rank = getPlayerRank(player);
  const rosterBestAtPosition = rosterPlayers.filter((item) => item.position === player.position).sort(comparePlayersForLineup)[0] ?? null;
  const beatsRosterBest = rosterBestAtPosition ? comparePlayersForLineup(player, rosterBestAtPosition) < 0 : true;
  const reasons: string[] = [];
  let rosterFit: TeamWaiverSummary["candidates"][number]["rosterFit"] = "stash";
  const weeklyPoints = getWeeklyProjectedPoints(player);
  const longTermValue = Math.max(0, 260 - rank);
  let score = weeklyPoints !== null
    ? weeklyPoints * 10 + longTermValue * 0.45
    : longTermValue;

  if (need?.status === "open_starter") {
    rosterFit = "starter_need";
    score += 120;
    reasons.push(`${player.position} is an open starter need.`);
  } else if (need?.status === "thin_depth") {
    rosterFit = "depth_need";
    score += 70;
    reasons.push(`${player.position} depth is thin.`);
  } else if (beatsRosterBest) {
    rosterFit = "upgrade";
    score += 45;
    reasons.push(`Profiles as an upgrade candidate at ${player.position}.`);
  } else {
    reasons.push(`Profiles as a bench stash at ${player.position}.`);
  }

  if (weeklyPoints !== null) {
    reasons.push(`FantasyPros Week ${player.weeklyProjectionWeek ?? "?"} projection: ${weeklyPoints.toFixed(1)} points.`);
  }
  if (player.rosRank) {
    const range = player.rosBestRank && player.rosWorstRank
      ? ` (expert range ${player.rosBestRank}-${player.rosWorstRank})`
      : "";
    reasons.push(`FantasyPros ${player.rosScoring ?? ""} ROS rank ${player.rosRank}${range}.`);
  } else if (!weeklyPoints && player.importedRank) {
    reasons.push(`FantasyPros import rank ${player.importedRank}${player.tier ? `, tier ${player.tier}` : ""}.`);
  } else if (!weeklyPoints) {
    reasons.push("No imported rank matched; using Sleeper metadata fallback.");
  }

  if (player.riskTags.length > 0) {
    reasons.push(`Risk tags: ${player.riskTags.join(", ")}.`);
    score -= 15;
  }

  if (suggestedDrop) {
    const dropRank = getPlayerRank(suggestedDrop);
    if (rank < dropRank) {
      reasons.push(`Ranks ahead of suggested drop ${suggestedDrop.name}.`);
      score += Math.min(35, dropRank - rank);
    }
  }

  return {
    player,
    score: Math.round(score * 10) / 10,
    rosterFit,
    valueLabel: weeklyPoints !== null && player.rosRank
      ? `${weeklyPoints.toFixed(1)} weekly pts - ROS ${player.rosRank}`
      : weeklyPoints !== null
        ? `${weeklyPoints.toFixed(1)} weekly pts`
        : player.rosRank
          ? `ROS rank ${player.rosRank}`
          : player.importedRank ? `Rank ${player.importedRank}` : "Sleeper fallback",
    suggestedDrop,
    reasons,
  };
}

function buildDropCandidates(state: TeamManagerState, rosterPlayers: Player[]): TeamWaiverSummary["dropCandidates"] {
  const starterIds = new Set(state.roster.starters.map((slot) => slot.player?.id).filter((id): id is string => Boolean(id)));
  return rosterPlayers
    .filter((player) => !starterIds.has(player.id))
    .map((player) => {
      const reasons: string[] = [];
      let score = getPlayerRank(player);
      const positionCount = state.roster.positionCounts[player.position] ?? 0;
      const requiredStarters = state.league.rosterSlots[player.position] ?? 0;

      if ((player.position === "K" || player.position === "DEF") && positionCount > requiredStarters) {
        score += 60;
        reasons.push(`Extra ${player.position} beyond required starter count.`);
      }
      if (positionCount > requiredStarters + 2 && requiredStarters > 0) {
        score += 30;
        reasons.push(`${player.position} is a surplus position on this roster.`);
      }
      if (player.riskTags.length > 0) {
        score += 15;
        reasons.push(`Risk tags: ${player.riskTags.join(", ")}.`);
      }
      if (player.rosRank) {
        reasons.push(`FantasyPros ROS rank ${player.rosRank}.`);
      }
      if (reasons.length === 0) {
        reasons.push("Bench player with the weakest deterministic value signal.");
      }

      return { player, score: Math.round(score * 10) / 10, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function buildWaiverFacts(
  availablePlayers: Player[],
  candidates: TeamWaiverSummary["candidates"],
  dropCandidates: TeamWaiverSummary["dropCandidates"],
  teamNeeds: TeamNeedsSummary,
): string[] {
  const facts: string[] = [`${availablePlayers.length} available players were considered.`];
  if (teamNeeds.weakestPositions.length > 0) {
    facts.push(`Current roster needs: ${teamNeeds.weakestPositions.join("/")}.`);
  }
  if (candidates[0]) {
    facts.push(`Top add candidate: ${candidates[0].player.name} (${candidates[0].player.position}).`);
  }
  if (dropCandidates[0]) {
    facts.push(`Most droppable candidate: ${dropCandidates[0].player.name} (${dropCandidates[0].player.position}).`);
  }
  return facts;
}

function getPlayerRank(player: Player): number {
  return player.rosAverageRank
    ?? player.rosRank
    ?? player.importedRank
    ?? player.adp
    ?? Math.max(1, Math.round(400 - player.projectedPoints));
}

function isFantasyStarterPosition(position: Position): boolean {
  return position === "QB" || position === "RB" || position === "WR" || position === "TE" || position === "K" || position === "DEF";
}
function buildDeterministicLineup(state: TeamManagerState, rosterPlayers: Player[]): TeamLineupAssignment[] {
  const remaining = new Map(rosterPlayers.map((player) => [player.id, player]));
  const fixedSlots = state.roster.starters.filter((slot) => !isFlexSlot(slot.slot));
  const flexSlots = state.roster.starters.filter((slot) => isFlexSlot(slot.slot));
  const assignments: TeamLineupAssignment[] = [];

  for (const slot of fixedSlots) {
    const player = takeBestEligiblePlayer(remaining, [slot.slot]);
    assignments.push({
      slot: slot.slot,
      eligiblePositions: slot.eligiblePositions,
      player,
      reason: player ? `Best available ${slot.slot} by current player metadata.` : `No ${slot.slot} eligible player is rostered.`,
    });
  }

  for (const slot of flexSlots) {
    const player = takeBestEligiblePlayer(remaining, slot.eligiblePositions);
    assignments.push({
      slot: slot.slot,
      eligiblePositions: slot.eligiblePositions,
      player,
      reason: player ? `Best remaining ${slot.eligiblePositions.join("/")} option by current player metadata.` : `No ${slot.eligiblePositions.join("/")} eligible player remains.`,
    });
  }

  return assignments;
}

function takeBestEligiblePlayer(remaining: Map<string, Player>, eligiblePositions: string[]): Player | null {
  const eligible = Array.from(remaining.values())
    .filter((player) => eligiblePositions.includes(player.position))
    .sort(comparePlayersForLineup);
  const selected = eligible[0] ?? null;
  if (selected) {
    remaining.delete(selected.id);
  }
  return selected;
}

function comparePlayersForLineup(a: Player, b: Player): number {
  const aRank = getPlayerRank(a);
  const bRank = getPlayerRank(b);
  const aHasWeeklyProjection = a.projectionSource === "weekly_projection" && a.weeklyProjectedPoints !== null && a.weeklyProjectedPoints !== undefined;
  const bHasWeeklyProjection = b.projectionSource === "weekly_projection" && b.weeklyProjectedPoints !== null && b.weeklyProjectedPoints !== undefined;
  if (aHasWeeklyProjection && bHasWeeklyProjection && a.weeklyProjectedPoints !== b.weeklyProjectedPoints) {
    return b.weeklyProjectedPoints! - a.weeklyProjectedPoints!;
  }
  if (aHasWeeklyProjection !== bHasWeeklyProjection) {
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return aHasWeeklyProjection ? -1 : 1;
  }
  if (a.projectedPoints !== b.projectedPoints) {
    return b.projectedPoints - a.projectedPoints;
  }
  if (aRank !== bRank) {
    return aRank - bRank;
  }
  return a.name.localeCompare(b.name);
}

function buildPositionNeeds(state: TeamManagerState, rosterPlayers: Player[]): TeamPositionNeed[] {
  return teamNeedPositions.map((position) => {
    const requiredStarters = state.league.rosterSlots[position] ?? 0;
    const rostered = rosterPlayers.filter((player) => player.position === position).length;
    const benchDepth = Math.max(0, rostered - requiredStarters);
    const reasons: string[] = [];
    let status: TeamPositionNeed["status"] = "covered";
    let priority = 0;

    if (requiredStarters > 0 && rostered < requiredStarters) {
      status = "open_starter";
      priority = 100 + (requiredStarters - rostered) * 20;
      reasons.push(`${position} has ${rostered}/${requiredStarters} required starter slots covered.`);
    } else if (requiredStarters > 0 && benchDepth === 0) {
      status = "thin_depth";
      priority = 55;
      reasons.push(`${position} starters are covered, but there is no direct bench depth.`);
    } else if (requiredStarters > 0 && benchDepth >= 3) {
      status = "surplus";
      priority = 0;
      reasons.push(`${position} has ${benchDepth} bench-depth player(s) beyond required starters.`);
    } else if (requiredStarters > 0) {
      reasons.push(`${position} has ${benchDepth} bench-depth player(s) beyond required starters.`);
    } else if (rostered > 1 && (position === "K" || position === "DEF")) {
      status = "surplus";
      reasons.push(`${position} has multiple rostered options despite no required starter slot.`);
    } else {
      reasons.push(`${position} has no required starter slot in this format.`);
    }

    return { position, rostered, requiredStarters, benchDepth, status, priority, reasons };
  });
}

function describeFlexPressure(state: TeamManagerState): string {
  const flexSlots = getFlexSlots(state.league.rosterSlots);
  const flexEligible = (state.roster.positionCounts.RB ?? 0) + (state.roster.positionCounts.WR ?? 0) + (state.roster.positionCounts.TE ?? 0);
  const flexDemand = (state.league.rosterSlots.RB ?? 0) + (state.league.rosterSlots.WR ?? 0) + (state.league.rosterSlots.TE ?? 0) + flexSlots;

  if (flexSlots <= 0) {
    return "This format has no standard RB/WR/TE flex pressure.";
  }

  if (flexEligible < flexDemand) {
    return `RB/WR/TE flex depth is short: ${flexEligible}/${flexDemand} starter-plus-flex demand.`;
  }

  if (flexEligible === flexDemand) {
    return `RB/WR/TE flex depth exactly covers starter-plus-flex demand (${flexEligible}/${flexDemand}) with little cushion.`;
  }

  return `RB/WR/TE flex depth has ${flexEligible - flexDemand} bench-depth player(s) beyond starter-plus-flex demand.`;
}

function buildTeamFacts(
  state: TeamManagerState,
  openStarterSlots: string[],
  positionNeeds: TeamPositionNeed[],
  flexPressure: string,
): string[] {
  const facts: string[] = [];
  if (openStarterSlots.length > 0) {
    facts.push(`Open starter slots: ${openStarterSlots.join(", ")}.`);
  }

  for (const need of positionNeeds.filter((item) => item.priority > 0).sort((a, b) => b.priority - a.priority).slice(0, 4)) {
    facts.push(...need.reasons);
  }

  facts.push(flexPressure);

  if (state.roster.bench.length === 0) {
    facts.push("No bench players are currently visible in Sleeper roster data.");
  }

  return Array.from(new Set(facts));
}

function getUniqueRosterPlayers(state: TeamManagerState): Player[] {
  const players = [
    ...state.roster.starters.map((slot) => slot.player).filter(isPlayer),
    ...state.roster.bench,
    ...state.roster.injuredReserve,
    ...state.roster.taxi,
  ];
  return Array.from(new Map(players.map((player) => [player.id, player])).values());
}

function getUniqueActiveRosterPlayers(state: TeamManagerState): Player[] {
  const players = [
    ...state.roster.starters.map((slot) => slot.player).filter(isPlayer),
    ...state.roster.bench,
  ];
  return Array.from(new Map(players.map((player) => [player.id, player])).values());
}

function isFlexSlot(slot: string): boolean {
  return ["FLEX", "WR_RB_FLEX", "REC_FLEX", "SUPER_FLEX", "SF"].includes(slot);
}

function getFlexSlots(slots: Record<string, number>): number {
  return (slots.FLEX ?? 0) + (slots.WR_RB_FLEX ?? 0) + (slots.REC_FLEX ?? 0);
}

function isPlayer(player: Player | null): player is Player {
  return Boolean(player);
}
export function createMockDraftState(picksToApply = 5): DraftState {
  const players = createMockPlayers();
  const teams = createMockTeams();
  const scriptedPicks = createScriptedPicks(players, teams);
  const picks = scriptedPicks.slice(0, Math.max(0, Math.min(picksToApply, scriptedPicks.length)));
  const rounds = Math.ceil(scriptedPicks.length / teams.length);
  const totalPicks = teams.length * rounds;

  return hydrateRosters({
    id: "mock-draft",
    name: "Mock Sleeper Draft",
    status: picks.length >= scriptedPicks.length ? "complete" : "drafting",
    currentPick: Math.min(picks.length + 1, totalPicks),
    userTeamId: "team-3",
    settings: {
      teams: 10,
      rounds,
      scoring: "PPR",
      rosterSlots: {
        QB: 1,
        RB: 2,
        WR: 2,
        TE: 1,
        FLEX: 2,
        BN: 7,
        K: 1,
        DEF: 1,
      },
    },
    teams,
    players,
    picks,
    updatedAt: new Date().toISOString(),
  });
}

export function advanceMockDraftState(state: DraftState): DraftState {
  const scriptedPicks = createScriptedPicks(state.players, state.teams);
  const totalPicks = state.settings.teams * state.settings.rounds;
  if (state.picks.length >= scriptedPicks.length) {
    return { ...state, currentPick: totalPicks, status: "complete", updatedAt: new Date().toISOString() };
  }

  const picks = [...state.picks, scriptedPicks[state.picks.length]];
  return hydrateRosters({
    ...state,
    currentPick: Math.min(picks.length + 1, totalPicks),
    status: picks.length >= scriptedPicks.length ? "complete" : "drafting",
    picks,
    updatedAt: new Date().toISOString(),
  });
}

export function getAvailablePlayers(state: DraftState): Player[] {
  const pickedIds = new Set(state.picks.map((pick) => pick.playerId));
  return state.players.filter((player) => !pickedIds.has(player.id));
}

export function buildDraftOptions(state: DraftState, limit = 8, options: DraftRecommendationOptions = {}): DraftOption[] {
  const userTeam = state.teams.find((team) => team.id === state.userTeamId);
  if (!userTeam) {
    return [];
  }

  const rosterCounts = countRosterPositions(userTeam, state.players);
  const preferenceSets = toPreferenceSets(options.preferences);
  const available = getAvailablePlayers(state).filter((player) => !preferenceSets.excluded.has(player.id));
  const mandatoryPositions = getMandatoryCompletionPositions(state, rosterCounts);
  const eligibleAvailable = mandatoryPositions.size > 0
    ? available.filter((player) => mandatoryPositions.has(player.position))
    : available;
  const importedAvailable = eligibleAvailable.filter(hasImportedDraftSignal);
  const pinnedAvailable = eligibleAvailable.filter((player) => preferenceSets.pinned.has(player.id));
  const optionPool = importedAvailable.length > 0
    ? Array.from(new Map([...importedAvailable, ...pinnedAvailable].map((player) => [player.id, player])).values())
    : eligibleAvailable;

  return optionPool
    .sort((a, b) => compareDraftOptionPlayers(a, b, preferenceSets))
    .slice(0, limit)
    .map((player) => toDraftOption(player, state, rosterCounts, mandatoryPositions));
}

export function buildDraftOptionForPlayer(
  state: DraftState,
  playerId: string,
  options: DraftRecommendationOptions = {},
): DraftOption | null {
  const userTeam = state.teams.find((team) => team.id === state.userTeamId);
  const player = getAvailablePlayers(state).find((candidate) => candidate.id === playerId);
  if (!userTeam || !player) {
    return null;
  }
  const preferenceSets = toPreferenceSets(options.preferences);
  if (preferenceSets.excluded.has(player.id)) {
    return null;
  }
  const rosterCounts = countRosterPositions(userTeam, state.players);
  return toDraftOption(player, state, rosterCounts, getMandatoryCompletionPositions(state, rosterCounts));
}

export function isDraftChoiceRosterFeasible(state: DraftState, playerId: string): boolean {
  const userTeam = state.teams.find((team) => team.id === state.userTeamId);
  const player = getAvailablePlayers(state).find((candidate) => candidate.id === playerId);
  if (!userTeam || !player) {
    return false;
  }
  const counts = countRosterPositions(userTeam, state.players);
  const requiredBeforeChoice = getHardRequiredStarterGapCount(state, counts);
  const remainingBeforeChoice = countRemainingUserPicks(state);
  counts[player.position] += 1;
  const requiredAfterChoice = getHardRequiredStarterGapCount(state, counts);
  return requiredBeforeChoice >= remainingBeforeChoice
    ? requiredAfterChoice < requiredBeforeChoice
    : requiredAfterChoice <= Math.max(0, remainingBeforeChoice - 1);
}

function getHardRequiredStarterGapCount(
  state: DraftState,
  rosterCounts: Record<Position, number>,
): number {
  const slots = state.settings.rosterSlots;
  const directGaps =
    Math.max(0, (slots.QB ?? 0) - rosterCounts.QB) +
    Math.max(0, (slots.RB ?? 0) - rosterCounts.RB) +
    Math.max(0, (slots.WR ?? 0) - rosterCounts.WR) +
    Math.max(0, (slots.TE ?? 0) - rosterCounts.TE) +
    Math.max(0, (slots.K ?? 0) - rosterCounts.K) +
    Math.max(0, (slots.DEF ?? 0) - rosterCounts.DEF);
  const regularFlexSlots = getDraftFlexSlotCount(slots);
  const rbWrTeSurplus =
    Math.max(0, rosterCounts.RB - (slots.RB ?? 0)) +
    Math.max(0, rosterCounts.WR - (slots.WR ?? 0)) +
    Math.max(0, rosterCounts.TE - (slots.TE ?? 0));
  const flexGap = Math.max(0, regularFlexSlots - rbWrTeSurplus);
  const superFlexSlots = (slots.SUPER_FLEX ?? 0) + (slots.SF ?? 0);
  const qbSurplus = Math.max(0, rosterCounts.QB - (slots.QB ?? 0));
  const superFlexGap = Math.max(
    0,
    superFlexSlots - qbSurplus - Math.max(0, rbWrTeSurplus - regularFlexSlots),
  );
  return directGaps + flexGap + superFlexGap;
}

function hasImportedDraftSignal(player: Player): boolean {
  return player.projectionSource !== "sleeper_search_rank"
    || player.importedRank !== null && player.importedRank !== undefined
    || player.seasonProjectedPoints !== null && player.seasonProjectedPoints !== undefined
    || Boolean(player.adpSource);
}

function compareDraftOptionPlayers(
  a: Player,
  b: Player,
  preferences: NormalizedRecommendationPreferences,
): number {
  const preferenceDelta = getPreferenceOrder(a.id, preferences) - getPreferenceOrder(b.id, preferences);
  if (preferenceDelta !== 0) {
    return preferenceDelta;
  }

  const comparisons: Array<[number | null | undefined, number | null | undefined, "asc" | "desc"]> = [
    [a.importedRank, b.importedRank, "asc"],
    [a.seasonProjectedPoints, b.seasonProjectedPoints, "desc"],
    [a.adpSource ? a.adp : null, b.adpSource ? b.adp : null, "asc"],
    [a.realTimeAdp, b.realTimeAdp, "asc"],
    [
      a.projectionSource === "sleeper_search_rank" ? a.adp : null,
      b.projectionSource === "sleeper_search_rank" ? b.adp : null,
      "asc",
    ],
  ];

  for (const [aValue, bValue, direction] of comparisons) {
    const result = compareOptionalNumbers(aValue, bValue, direction);
    if (result !== 0) {
      return result;
    }
  }
  return a.name.localeCompare(b.name);
}

function compareOptionalNumbers(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: "asc" | "desc",
): number {
  if (a === null || a === undefined) {
    return b === null || b === undefined ? 0 : 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  return direction === "asc" ? a - b : b - a;
}

function getPreferenceOrder(playerId: string, preferences: NormalizedRecommendationPreferences): number {
  if (preferences.pinned.has(playerId)) {
    return -1;
  }
  if (preferences.faded.has(playerId)) {
    return 1;
  }
  return 0;
}

function toDraftOption(
  player: Player,
  state: DraftState,
  rosterCounts: Record<Position, number>,
  mandatoryPositions: Set<Position>,
): DraftOption {
  const order = getDraftOptionOrder(player);
  return {
    player,
    rosterFit: getRosterFit(player.position, state, rosterCounts),
    evidence: getDraftOptionEvidence(player),
    orderSource: order.source,
    orderLabel: order.label,
    requiredToCompleteLineup: mandatoryPositions.has(player.position),
  };
}

function getDraftOptionOrder(player: Player): { source: DraftOption["orderSource"]; label: string } {
  if (player.importedRank !== null && player.importedRank !== undefined) {
    return { source: "ecr", label: `ECR rank ${player.importedRank}` };
  }
  if (player.seasonProjectedPoints !== null && player.seasonProjectedPoints !== undefined) {
    return { source: "projection", label: `${player.seasonProjectedPoints.toFixed(1)} projected points` };
  }
  if (player.adpSource && player.adp !== null && player.adp !== undefined) {
    return { source: "sleeper_adp", label: `Sleeper ADP ${player.adp.toFixed(1)}` };
  }
  if (player.realTimeAdp !== null && player.realTimeAdp !== undefined) {
    return { source: "real_time_adp", label: `Real-Time ADP ${player.realTimeAdp.toFixed(1)}` };
  }
  if (player.projectionSource === "sleeper_search_rank" && player.adp !== null && player.adp !== undefined) {
    return { source: "sleeper_rank", label: `Sleeper placeholder rank ${Math.round(player.adp)}` };
  }
  return { source: "name", label: "Alphabetical fallback" };
}

function getDraftOptionEvidence(player: Player): string[] {
  const evidence: string[] = [];
  if (player.importedRank !== null && player.importedRank !== undefined) {
    evidence.push(`ECR rank ${player.importedRank}${player.tier ? `, tier ${player.tier}` : ""}`);
  }
  if (player.seasonProjectedPoints !== null && player.seasonProjectedPoints !== undefined) {
    const qualifier = player.seasonProjectionCoverage === "provider_approximation" ? "provider estimate" : "league-scored";
    evidence.push(`${player.seasonProjectedPoints.toFixed(1)} season points (${qualifier})`);
  }
  if (player.adpSource && player.adp !== null && player.adp !== undefined) {
    evidence.push(`Sleeper ADP ${player.adp.toFixed(1)}`);
  }
  if (player.realTimeAdp !== null && player.realTimeAdp !== undefined) {
    evidence.push(`Real-Time ADP ${player.realTimeAdp.toFixed(1)}`);
  }
  if (player.projectionSource === "sleeper_search_rank" && player.adp !== null && player.adp !== undefined) {
    evidence.push(`Sleeper placeholder rank ${Math.round(player.adp)}`);
  }
  if (player.riskTags.length > 0) {
    evidence.push(`Imported risk flags: ${player.riskTags.join(", ")}`);
  }
  return evidence.length > 0 ? evidence : ["No imported ranking, projection, or ADP evidence."];
}

function getDraftOptionRisks(option: DraftOption): string[] {
  return option.player.riskTags.length > 0
    ? option.player.riskTags
    : ["No imported risk flags are attached to the first local reference option."];
}

export function buildDraftRecommendation(state: DraftState, options: DraftRecommendationOptions = {}): DraftRecommendation {
  const candidates = buildDraftOptions(state, options.candidateLimit ?? 5, options);
  const top = candidates[0];

  if (!top) {
    return {
      headline: "No available candidates found",
      recommendedPlayerId: null,
      confidence: "low",
      candidates: [],
      summary: "The draft state has no available players to show.",
      risks: ["Player pool is empty or not loaded."],
      assumptions: ["The local reference board has no imported player values.", ...getPreferenceAssumptions(state, options.preferences)],
    };
  }

  const isPlaceholder = top.player.projectionSource === "sleeper_search_rank";
  const mustCompleteLineup = top.requiredToCompleteLineup;

  return {
    headline: mustCompleteLineup
      ? `Required ${top.player.position} reference: ${top.player.name}`
      : isPlaceholder
        ? `Placeholder reference: ${top.player.name}`
        : `Local reference: ${top.player.name}`,
    recommendedPlayerId: top.player.id,
    confidence: "low",
    candidates,
    summary: mustCompleteLineup
      ? `${top.player.position} is restricted by the remaining starter requirements. Players are ordered by imported evidence within the eligible positions.`
      : "Reference board ordered by ECR first, then season projection, Sleeper ADP, Real-Time ADP, and Sleeper placeholder rank. It is not a strategic recommendation.",
    risks: [...getDraftOptionRisks(top), ...(state.settings.formatCompatibility?.warnings ?? [])],
    assumptions: [...getRecommendationAssumptions(top.player.projectionSource), ...getPreferenceAssumptions(state, options.preferences)],
  };
}

function getRecommendationAssumptions(source: Player["projectionSource"]): string[] {
  if (source === "sleeper_search_rank") {
    return [
      "Sleeper does not provide fantasy projections; current player ordering uses Sleeper search-rank metadata as a temporary placeholder.",
      "Import rankings or projections before relying on recommendations for a real draft.",
    ];
  }

  if (source === "mock") {
    return [
      "Mock projections and ADP are demo data.",
    ];
  }

  if (source === "weekly_projection") {
    return [
      "Imported weekly projections are powering this recommendation.",
    ];
  }

  if (source === "season_projection") {
    return [
      "Imported season projections are scored with the connected Sleeper league settings for supported offensive statistics.",
      "Kicker and defense projections may use FantasyPros provider points when the export lacks enough detail for exact league scoring.",
    ];
  }

  return [
    "Imported projections or rankings are powering this recommendation.",
  ];
}
function hydrateRosters(state: DraftState): DraftState {
  const picksByTeam = new Map<string, string[]>();
  for (const pick of state.picks) {
    const roster = picksByTeam.get(pick.teamId) ?? [];
    roster.push(pick.playerId);
    picksByTeam.set(pick.teamId, roster);
  }

  return {
    ...state,
    teams: state.teams.map((team) => ({
      ...team,
      roster: picksByTeam.get(team.id) ?? [],
    })),
  };
}

function getRosterFit(
  position: Position,
  state: DraftState,
  rosterCounts: Record<Position, number>,
): DraftOption["rosterFit"] {
  const slots = state.settings.rosterSlots;
  const superFlexSlots = (slots.SUPER_FLEX ?? 0) + (slots.SF ?? 0);
  const directDemand = (slots[position] ?? 0) + (position === "QB" ? superFlexSlots : 0);
  if (rosterCounts[position] < directDemand) {
    return "need";
  }

  if (position === "RB" || position === "WR") {
    const flexSlots = getDraftFlexSlotCount(slots);
    const flexEligibleRostered = rosterCounts.RB + rosterCounts.WR + rosterCounts.TE;
    const flexEligibleDemand = (slots.RB ?? 0) + (slots.WR ?? 0) + (slots.TE ?? 0) + flexSlots;
    const maximumStartingCapacity = directDemand + flexSlots;
    if (flexEligibleRostered < flexEligibleDemand && rosterCounts[position] < maximumStartingCapacity) {
      return "need";
    }

    return rosterCounts[position] < maximumStartingCapacity + 2 ? "depth" : "luxury";
  }

  return "luxury";
}

function getDraftFlexSlotCount(slots: Record<string, number>): number {
  return (slots.FLEX ?? 0) + (slots.WR_RB_FLEX ?? 0) + (slots.REC_FLEX ?? 0);
}

function getMandatoryCompletionPositions(
  state: DraftState,
  rosterCounts: Record<Position, number>,
): Set<Position> {
  const directGaps = getDirectStarterGaps(state, rosterCounts);
  const flexGap = getFlexibleStarterGap(state, rosterCounts);
  const requiredPositions = (Object.entries(directGaps) as Array<[Position, number]>)
    .filter(([, gap]) => gap > 0)
    .map(([position]) => position);
  if (flexGap > 0) {
    requiredPositions.push("RB", "WR", "TE");
  }

  if (requiredPositions.length === 0) {
    return new Set();
  }

  const totalRequiredGaps = Object.values(directGaps).reduce((total, gap) => total + gap, flexGap);
  const remainingPicks = countRemainingUserPicks(state);
  return remainingPicks === totalRequiredGaps
    ? new Set(requiredPositions)
    : new Set();
}

function getFlexibleStarterGap(
  state: DraftState,
  rosterCounts: Record<Position, number>,
): number {
  const slots = state.settings.rosterSlots;
  const flexSlots = getDraftFlexSlotCount(slots);
  if (flexSlots <= 0) {
    return 0;
  }

  const surplusRb = Math.max(0, rosterCounts.RB - (slots.RB ?? 0));
  const surplusWr = Math.max(0, rosterCounts.WR - (slots.WR ?? 0));
  const surplusTe = Math.max(0, rosterCounts.TE - (slots.TE ?? 0));
  return Math.max(0, flexSlots - surplusRb - surplusWr - surplusTe);
}

function getDirectStarterGaps(
  state: DraftState,
  rosterCounts: Record<Position, number>,
): Record<Position, number> {
  const slots = state.settings.rosterSlots;
  const superFlexSlots = (slots.SUPER_FLEX ?? 0) + (slots.SF ?? 0);
  return {
    QB: Math.max(0, (slots.QB ?? 0) + superFlexSlots - rosterCounts.QB),
    RB: Math.max(0, (slots.RB ?? 0) - rosterCounts.RB),
    WR: Math.max(0, (slots.WR ?? 0) - rosterCounts.WR),
    TE: Math.max(0, (slots.TE ?? 0) - rosterCounts.TE),
    K: Math.max(0, (slots.K ?? 0) - rosterCounts.K),
    DEF: Math.max(0, (slots.DEF ?? 0) - rosterCounts.DEF),
  };
}

function countRemainingUserPicks(state: DraftState): number {
  if (state.pickOrder?.source === "sleeper" && state.pickOrder.entries.length > 0) {
    return state.pickOrder.entries.filter((entry) => entry.pickNo >= state.currentPick && entry.teamId === state.userTeamId).length;
  }
  const userSlot = state.teams.find((team) => team.id === state.userTeamId)?.draftSlot ?? 1;
  const totalPicks = state.settings.teams * state.settings.rounds;
  let remaining = 0;
  for (let pickNo = state.currentPick; pickNo <= totalPicks; pickNo += 1) {
    const round = Math.ceil(pickNo / state.settings.teams);
    const pickInRound = ((pickNo - 1) % state.settings.teams) + 1;
    const draftSlot = round % 2 === 1 ? pickInRound : state.settings.teams + 1 - pickInRound;
    if (draftSlot === userSlot) {
      remaining += 1;
    }
  }
  return remaining;
}
function countRosterPositions(team: Team, players: Player[]): Record<Position, number> {
  const counts: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DEF: 0,
  };
  const byId = new Map(players.map((player) => [player.id, player]));

  for (const playerId of team.roster) {
    const player = byId.get(playerId);
    if (player) {
      counts[player.position] += 1;
    }
  }

  return counts;
}

type NormalizedRecommendationPreferences = {
  pinned: Set<string>;
  faded: Set<string>;
  excluded: Set<string>;
};

function toPreferenceSets(preferences: DraftRecommendationPreferences | undefined): NormalizedRecommendationPreferences {
  return {
    pinned: new Set(preferences?.pinnedPlayerIds ?? []),
    faded: new Set(preferences?.fadedPlayerIds ?? []),
    excluded: new Set(preferences?.excludedPlayerIds ?? []),
  };
}

function getPreferenceAssumptions(state: DraftState, preferences: DraftRecommendationPreferences | undefined): string[] {
  const namesById = new Map(state.players.map((player) => [player.id, player.name]));
  const assumptions: string[] = [];
  const pinned = preferenceNames(preferences?.pinnedPlayerIds, namesById);
  const faded = preferenceNames(preferences?.fadedPlayerIds, namesById);
  const excluded = preferenceNames(preferences?.excludedPlayerIds, namesById);

  if (pinned.length > 0) {
    assumptions.push(`User pinned: ${pinned.join(", ")}.`);
  }
  if (faded.length > 0) {
    assumptions.push(`User faded: ${faded.join(", ")}.`);
  }
  if (excluded.length > 0) {
    assumptions.push(`Excluded players hidden from recommendations: ${excluded.join(", ")}.`);
  }

  return assumptions;
}

function preferenceNames(playerIds: string[] | undefined, namesById: Map<string, string>): string[] {
  return Array.from(new Set(playerIds ?? [])).map((playerId) => namesById.get(playerId) ?? playerId);
}
function createMockTeams(): Team[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `team-${index + 1}`,
    name: index === 2 ? "Your Team" : `Team ${index + 1}`,
    draftSlot: index + 1,
    roster: [],
  }));
}

function createScriptedPicks(players: Player[], teams: Team[]): Pick[] {
  const picks: Pick[] = [];
  const playerOrder = [...players]
    .sort((a, b) => (a.adp ?? Number.MAX_SAFE_INTEGER) - (b.adp ?? Number.MAX_SAFE_INTEGER))
    .map((player) => player.id);

  for (const playerId of playerOrder) {
    const pickNo = picks.length + 1;
    const round = Math.ceil(pickNo / teams.length);
    const pickInRound = ((pickNo - 1) % teams.length) + 1;
    const draftSlot = round % 2 === 1 ? pickInRound : teams.length + 1 - pickInRound;
    const team = teams.find((candidate) => candidate.draftSlot === draftSlot) ?? teams[0];
    picks.push({
      pickNo,
      round,
      draftSlot,
      teamId: team.id,
      playerId,
    });
  }

  return picks;
}

function createMockPlayers(): Player[] {
  return [
    player("p-jefferson", "Justin Jefferson", "MIN", "WR", 315, 1.8, 1),
    player("p-mccaffrey", "Christian McCaffrey", "SF", "RB", 304, 2.2, 1, ["age"]),
    player("p-lamb", "CeeDee Lamb", "DAL", "WR", 302, 3.1, 1),
    player("p-chase", "Ja'Marr Chase", "CIN", "WR", 298, 4.0, 1),
    player("p-bijan", "Bijan Robinson", "ATL", "RB", 286, 5.2, 1),
    player("p-hill", "Tyreek Hill", "MIA", "WR", 282, 6.5, 1, ["age"]),
    player("p-st-brown", "Amon-Ra St. Brown", "DET", "WR", 276, 7.6, 1),
    player("p-hall", "Breece Hall", "NYJ", "RB", 269, 8.4, 1),
    player("p-robinson", "Jahmyr Gibbs", "DET", "RB", 263, 10.1, 2),
    player("p-brown", "A.J. Brown", "PHI", "WR", 260, 11.7, 2),
    player("p-gibbs", "Jonathan Taylor", "IND", "RB", 252, 12.9, 2, ["injury history"]),
    player("p-wilson", "Garrett Wilson", "NYJ", "WR", 249, 14.3, 2),
    player("p-taylor", "Saquon Barkley", "PHI", "RB", 244, 16.0, 2),
    player("p-nacua", "Puka Nacua", "LAR", "WR", 242, 17.1, 2),
    player("p-barkley", "Marvin Harrison Jr.", "ARI", "WR", 236, 19.5, 3, ["role uncertainty"]),
    player("p-achane", "De'Von Achane", "MIA", "RB", 231, 21.0, 3, ["size", "volatility"]),
    player("p-kelce", "Travis Kelce", "KC", "TE", 214, 22.4, 1, ["age"]),
    player("p-laporta", "Sam LaPorta", "DET", "TE", 207, 25.7, 1),
    player("p-allen", "Josh Allen", "BUF", "QB", 363, 27.2, 1),
    player("p-hurts", "Jalen Hurts", "PHI", "QB", 354, 31.5, 1),
    player("p-etienne", "Travis Etienne", "JAX", "RB", 223, 28.1, 3),
    player("p-olave", "Chris Olave", "NO", "WR", 224, 29.8, 3),
    player("p-london", "Drake London", "ATL", "WR", 219, 33.0, 3),
    player("p-andrews", "Mark Andrews", "BAL", "TE", 190, 36.8, 2, ["injury history"]),
    player("p-mahomes", "Patrick Mahomes", "KC", "QB", 338, 38.9, 2),
    player("p-cook", "James Cook", "BUF", "RB", 211, 41.2, 4),
    player("p-smith", "DeVonta Smith", "PHI", "WR", 210, 42.7, 4),
    player("p-pitts", "Kyle Pitts", "ATL", "TE", 168, 67.0, 3, ["role uncertainty"]),
    player("p-tucker", "Justin Tucker", "BAL", "K", 142, 145.0, 1),
    player("p-ravens", "Baltimore Ravens", "BAL", "DEF", 136, 150.0, 1),
  ];
}

function player(
  id: string,
  name: string,
  team: string,
  position: Position,
  projectedPoints: number,
  adp: number,
  tier: number,
  riskTags: string[] = [],
): Player {
  return {
    id,
    sleeperId: id.replace("p-", "mock-"),
    name,
    team,
    position,
    projectedPoints,
    adp,
    tier,
    riskTags,
    projectionSource: "mock",
  };
}


