import type {
  CandidateSignal,
  DraftRecommendation,
  DraftState,
  Pick,
  Player,
  Position,
  Team,
  TeamLineupAssignment,
  TeamManagerState,
  TeamNeedsSummary,
  TeamPositionNeed,
} from "@sleeper-ai/shared";

const positionBaselines: Record<Position, number> = {
  QB: 250,
  RB: 180,
  WR: 175,
  TE: 135,
  K: 105,
  DEF: 110,
};

const targetRosterCounts: Record<Position, number> = {
  QB: 1,
  RB: 4,
  WR: 5,
  TE: 1,
  K: 0,
  DEF: 0,
};
export type DraftRecommendationPreferences = {
  pinnedPlayerIds?: string[];
  fadedPlayerIds?: string[];
  excludedPlayerIds?: string[];
};

export type DraftRecommendationOptions = {
  preferences?: DraftRecommendationPreferences;
};


const teamNeedPositions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

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
  const aRank = a.importedRank ?? a.adp ?? Number.MAX_SAFE_INTEGER;
  const bRank = b.importedRank ?? b.adp ?? Number.MAX_SAFE_INTEGER;
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

  return hydrateRosters({
    id: "mock-draft",
    name: "Mock Sleeper Draft",
    status: picks.length >= scriptedPicks.length ? "complete" : "drafting",
    currentPick: picks.length + 1,
    userTeamId: "team-3",
    settings: {
      teams: 10,
      rounds: 16,
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
  if (state.picks.length >= scriptedPicks.length) {
    return { ...state, status: "complete", updatedAt: new Date().toISOString() };
  }

  const picks = [...state.picks, scriptedPicks[state.picks.length]];
  return hydrateRosters({
    ...state,
    currentPick: picks.length + 1,
    status: picks.length >= scriptedPicks.length ? "complete" : "drafting",
    picks,
    updatedAt: new Date().toISOString(),
  });
}

export function getAvailablePlayers(state: DraftState): Player[] {
  const pickedIds = new Set(state.picks.map((pick) => pick.playerId));
  return state.players.filter((player) => !pickedIds.has(player.id));
}

export function buildCandidateSignals(state: DraftState, limit = 8, options: DraftRecommendationOptions = {}): CandidateSignal[] {
  const userTeam = state.teams.find((team) => team.id === state.userTeamId);
  if (!userTeam) {
    return [];
  }

  const rosterCounts = countRosterPositions(userTeam, state.players);
  const preferenceSets = toPreferenceSets(options.preferences);
  const available = getAvailablePlayers(state).filter((player) => !preferenceSets.excluded.has(player.id));

  return available
    .map((player) => toCandidateSignal(player, state, rosterCounts, preferenceSets))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildDraftRecommendation(state: DraftState, options: DraftRecommendationOptions = {}): DraftRecommendation {
  const candidates = buildCandidateSignals(state, 5, options);
  const top = candidates[0];

  if (!top) {
    return {
      headline: "No available candidates found",
      recommendedPlayerId: null,
      confidence: "low",
      candidates: [],
      summary: "The draft state has no available players to evaluate.",
      risks: ["Player pool is empty or not loaded."],
      assumptions: ["Recommendation engine is running without imported projections.", ...getPreferenceAssumptions(state, options.preferences)],
    };
  }

  const alternatives = candidates
    .slice(1, 3)
    .map((candidate) => candidate.player.name)
    .join(" or ");

  const isPlaceholder = top.player.projectionSource === "sleeper_search_rank";

  return {
    headline: isPlaceholder ? `Placeholder lean: ${top.player.name}` : `Lean ${top.player.name}`,
    recommendedPlayerId: top.player.id,
    confidence: isPlaceholder ? "low" : top.score > 80 ? "high" : top.score > 66 ? "medium" : "low",
    candidates,
    summary: getRecommendationSummary(top, alternatives),
    risks: collectRisks(top),
    assumptions: [...getRecommendationAssumptions(top.player.projectionSource), ...getPreferenceAssumptions(state, options.preferences)],
  };
}

function getRecommendationSummary(top: CandidateSignal, alternatives: string): string {
  if (top.player.projectionSource === "sleeper_search_rank") {
    return alternatives.length > 0
      ? `${top.player.name} leads the temporary Sleeper-rank signal set. Treat this as a board sanity check, not a real projection-backed recommendation; compare against ${alternatives}.`
      : `${top.player.name} leads the temporary Sleeper-rank signal set. Import rankings or projections before trusting this as pick advice.`;
  }

  return alternatives.length > 0
    ? `${top.player.name} is the best blend of projection, roster fit, and value. If you want a different roster shape, compare against ${alternatives}.`
    : `${top.player.name} is the strongest available candidate in this board.`;
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

function toCandidateSignal(
  player: Player,
  state: DraftState,
  rosterCounts: Record<Position, number>,
  preferences: NormalizedRecommendationPreferences,
): CandidateSignal {
  const baseline = positionBaselines[player.position];
  const projectedEdge = Number((player.projectedPoints - baseline).toFixed(1));
  const rosterFit = getRosterFit(player.position, rosterCounts);
  const scarcityBoost = getScarcityBoost(player.position, state);
  const constructionBoost = getRosterConstructionBoost(player.position, state, rosterCounts);
  const adpValue = player.adp === null ? 0 : player.adp - state.currentPick;
  const returnProbability = estimateReturnProbability(player, state);
  const fitBoost = rosterFit === "need" ? 13 : rosterFit === "depth" ? 5 : -4;
  const tierBoost = player.tier === null ? 0 : Math.max(0, 8 - player.tier);
  const importedRankBoost = player.importedRank ? Math.max(0, 30 - player.importedRank / 16) : 0;
  const riskPenalty = player.riskTags.length * 3;
  const preferenceBoost = getPreferenceBoost(player.id, preferences);
  const score = clamp(
    55 + projectedEdge / getProjectedEdgeDivisor(player.position) + fitBoost + scarcityBoost + constructionBoost + adpValue / 6 + tierBoost + importedRankBoost + preferenceBoost - riskPenalty,
    0,
    100,
  );

  return {
    player,
    score: Number(score.toFixed(1)),
    projectedEdge,
    rosterFit,
    valueLabel: getValueLabel(player, adpValue),
    scarcityLabel: getScarcityLabel(scarcityBoost),
    returnProbability,
    reasons: getReasons(player, projectedEdge, rosterFit, adpValue, returnProbability, preferences, constructionBoost),
  };
}

function getRosterFit(position: Position, rosterCounts: Record<Position, number>): CandidateSignal["rosterFit"] {
  if (rosterCounts[position] < targetRosterCounts[position]) {
    return "need";
  }

  if (position === "RB" || position === "WR") {
    return rosterCounts[position] < targetRosterCounts[position] + 2 ? "depth" : "luxury";
  }

  return "luxury";
}

function getProjectedEdgeDivisor(position: Position): number {
  return position === "QB" ? 12 : position === "TE" ? 9 : 8;
}

function getRosterConstructionBoost(
  position: Position,
  state: DraftState,
  rosterCounts: Record<Position, number>,
): number {
  const slots = state.settings.rosterSlots;
  const flexSlots = (slots.FLEX ?? 0) + (slots.WR_RB_FLEX ?? 0) + (slots.REC_FLEX ?? 0);
  const superFlexSlots = (slots.SUPER_FLEX ?? 0) + (slots.SF ?? 0);
  const rbWrDemand = (slots.RB ?? 0) + (slots.WR ?? 0) + flexSlots;
  const rbWrRostered = rosterCounts.RB + rosterCounts.WR;

  if (position === "RB" || position === "WR") {
    const flexPressure = Math.min(10, flexSlots * 4);
    const starterPressure = rosterCounts[position] < (slots[position] ?? 0) ? 4 : 0;
    const depthPressure = rbWrRostered < rbWrDemand ? 4 : 0;
    const pprPressure = state.settings.scoring.toLowerCase().includes("ppr") ? 2 : 0;
    return flexPressure + starterPressure + depthPressure + pprPressure;
  }

  if (position === "QB") {
    if (superFlexSlots > 0) {
      return 10;
    }

    return state.settings.teams <= 10 ? -8 : -4;
  }

  if (position === "TE") {
    return state.settings.teams <= 10 ? -4 : 0;
  }

  return -10;
}
function getScarcityBoost(position: Position, state: DraftState): number {
  const availableAtPosition = getAvailablePlayers(state).filter((player) => player.position === position);
  const aboveBaseline = availableAtPosition.filter(
    (player) => player.projectedPoints > positionBaselines[position],
  ).length;

  if (position === "TE" && aboveBaseline <= 2) {
    return 9;
  }

  if ((position === "RB" || position === "WR") && aboveBaseline <= state.settings.teams) {
    return 6;
  }

  return 0;
}

function estimateReturnProbability(player: Player, state: DraftState): number {
  const marketRank = player.adp ?? player.importedRank ?? null;
  if (marketRank === null) {
    return 0.35;
  }

  const picksUntilUser = picksUntilNextUserPick(state);
  const expectedPickWindow = state.currentPick + picksUntilUser;
  const gap = marketRank - expectedPickWindow;

  if (gap >= 8) {
    return 0.72;
  }

  if (gap >= 2) {
    return 0.46;
  }

  if (gap >= -4) {
    return 0.22;
  }

  return 0.08;
}

function picksUntilNextUserPick(state: DraftState): number {
  const userSlot = state.teams.find((team) => team.id === state.userTeamId)?.draftSlot ?? 1;
  const currentPick = state.currentPick;

  for (let pickNo = currentPick; pickNo <= state.settings.teams * state.settings.rounds; pickNo += 1) {
    const round = Math.ceil(pickNo / state.settings.teams);
    const pickInRound = ((pickNo - 1) % state.settings.teams) + 1;
    const draftSlot = round % 2 === 1 ? pickInRound : state.settings.teams + 1 - pickInRound;
    if (draftSlot === userSlot) {
      return pickNo - currentPick;
    }
  }

  return state.settings.teams;
}

function getValueLabel(player: Player, adpValue: number): string {
  if (player.projectionSource === "sleeper_search_rank") {
    if (player.adp === null) {
      return "no Sleeper rank";
    }

    if (adpValue >= 12) {
      return "later-ranked by Sleeper";
    }

    if (adpValue >= 4) {
      return "Sleeper rank cushion";
    }

    if (adpValue <= -10) {
      return "ahead of Sleeper rank";
    }

    return "near Sleeper rank";
  }

  if (player.projectionSource === "imported") {
    if (player.ecrVsAdp !== null && player.ecrVsAdp !== undefined) {
      if (player.ecrVsAdp >= 12) {
        return "well ahead of ADP";
      }

      if (player.ecrVsAdp >= 4) {
        return "ahead of ADP";
      }

      if (player.ecrVsAdp <= -12) {
        return "expensive vs ADP";
      }
    }

    return player.importedRank ? `rank ${player.importedRank}` : "imported rank";
  }

  if (adpValue >= 12) {
    return "major ADP discount";
  }

  if (adpValue >= 4) {
    return "positive ADP value";
  }

  if (adpValue <= -10) {
    return "needs a reach";
  }

  return "near market";
}
function getScarcityLabel(boost: number): string {
  if (boost >= 8) {
    return "thin tier";
  }

  if (boost >= 5) {
    return "position drying up";
  }

  return "stable supply";
}

function getReasons(
  player: Player,
  projectedEdge: number,
  rosterFit: CandidateSignal["rosterFit"],
  adpValue: number,
  returnProbability: number,
  preferences: NormalizedRecommendationPreferences,
  constructionBoost: number,
): string[] {
  const reasons = [
    getPrimarySignalReason(player, projectedEdge),
    rosterFit === "need" ? `fills a ${player.position} roster need` : `adds ${player.position} depth`,
    getValueLabel(player, adpValue),
  ];

  if (constructionBoost >= 10 && (player.position === "RB" || player.position === "WR")) {
    reasons.push("matches RB/WR flex demand");
  }

  if (constructionBoost < 0 && (player.position === "QB" || player.position === "TE")) {
    reasons.push("shallow league reduces replacement pressure");
  }

  if (preferences.pinned.has(player.id)) {
    reasons.push("user pinned this player");
  }

  if (preferences.faded.has(player.id)) {
    reasons.push("user faded this player");
  }

  if (returnProbability < 0.25) {
    reasons.push("unlikely to return to your next pick");
  }

  if (player.riskTags.length > 0) {
    reasons.push(`risk flags: ${player.riskTags.join(", ")}`);
  }

  return reasons;
}
function getPrimarySignalReason(player: Player, projectedEdge: number): string {
  if (player.projectionSource === "sleeper_search_rank") {
    return player.adp === null
      ? "Sleeper metadata is present, but no search-rank signal is available"
      : `Sleeper search rank ${Math.round(player.adp)} is the temporary ordering signal`;
  }

  if (player.projectionSource === "imported" && player.importedRank) {
    const tier = player.tier ? `, tier ${player.tier}` : "";
    return `${player.importedSource ?? "Imported"} rank ${player.importedRank}${tier}`;
  }

  return `${projectedEdge >= 0 ? "+" : ""}${projectedEdge.toFixed(1)} projected points over baseline`;
}

function collectRisks(signal: CandidateSignal): string[] {
  const risks = [...signal.player.riskTags];

  if (signal.returnProbability > 0.6) {
    risks.push("There is a reasonable chance this player returns, depending on room behavior.");
  }

  if (signal.rosterFit === "luxury") {
    risks.push("This pick may delay filling a thinner roster slot.");
  }

  return risks.length > 0 ? risks : ["No major visible risk flags in the current data."];
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

function getPreferenceBoost(playerId: string, preferences: NormalizedRecommendationPreferences): number {
  if (preferences.pinned.has(playerId)) {
    return 14;
  }

  if (preferences.faded.has(playerId)) {
    return -18;
  }

  return 0;
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
  const playerOrder = [
    "p-jefferson",
    "p-mccaffrey",
    "p-lamb",
    "p-chase",
    "p-bijan",
    "p-hill",
    "p-st-brown",
    "p-hall",
    "p-robinson",
    "p-brown",
    "p-gibbs",
    "p-wilson",
    "p-taylor",
    "p-nacua",
    "p-barkley",
  ];
  const playerIds = new Set(players.map((player) => player.id));

  for (const playerId of playerOrder) {
    if (!playerIds.has(playerId)) {
      continue;
    }

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}


