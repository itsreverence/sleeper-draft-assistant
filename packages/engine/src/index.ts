import type {
  DraftOption,
  DraftRecommendation,
  DraftState,
  Pick,
  Player,
  Position,
  Team,
} from "@sleeper-draft-assistant/shared";

export {
  buildTeamDataReadiness,
  isWeeklyProjectionSummaryFresh,
  WEEKLY_PROJECTION_STALE_AFTER_DAYS,
} from "./team-data-readiness";

export type DraftRecommendationPreferences = {
  pinnedPlayerIds?: string[];
  fadedPlayerIds?: string[];
  excludedPlayerIds?: string[];
};

export type DraftRecommendationOptions = {
  preferences?: DraftRecommendationPreferences;
  candidateLimit?: number;
};


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
