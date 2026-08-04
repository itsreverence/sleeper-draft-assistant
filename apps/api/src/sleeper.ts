import type { DraftPickOrder, DraftSettings, DraftState, Pick, Player, Position, Team, TeamActivitySummary, TeamManagerState, TeamWeekContext, TeamWeekPlayer } from "@sleeper-draft-assistant/shared";

import { assessFormatCompatibility } from "./format-compatibility";

const sleeperApiBaseUrl = "https://api.sleeper.app/v1";
const playerCacheTtlMs = 24 * 60 * 60 * 1000;
const playerPoolLimit = 700;
const sleeperRequestTimeoutMs = 12_000;
const sleeperRequestAttempts = 3;

const supportedPositions = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DEF"]);

const positionBaselines: Record<Position, number> = {
  QB: 250,
  RB: 180,
  WR: 175,
  TE: 135,
  K: 105,
  DEF: 110,
};

type JsonRecord = Record<string, unknown>;

export type SleeperDraft = {
  draft_id: string;
  type?: string | null;
  season?: string | null;
  league_id?: string | null;
  status?: string | null;
  settings?: JsonRecord | null;
  metadata?: JsonRecord | null;
  draft_order?: Record<string, number | string> | null;
  slot_to_roster_id?: Record<string, number | string> | null;
};

export type SleeperPick = {
  player_id?: string | null;
  picked_by?: string | null;
  roster_id?: number | string | null;
  round?: number | null;
  draft_slot?: number | null;
  pick_no?: number | null;
  is_keeper?: boolean | null;
  metadata?: JsonRecord | null;
};

export type SleeperTradedPick = {
  season?: string | null;
  round?: number | null;
  roster_id?: number | string | null;
  previous_owner_id?: number | string | null;
  owner_id?: number | string | null;
};

export type SleeperLeague = {
  league_id: string;
  draft_id?: string | null;
  name?: string | null;
  total_rosters?: number | null;
  status?: string | null;
  season?: string | null;
  scoring_settings?: JsonRecord | null;
  roster_positions?: string[] | null;
};

export type SleeperRoster = {
  roster_id: number;
  owner_id?: string | null;
  players?: string[] | null;
  starters?: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
};

export type SleeperUser = {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  metadata?: JsonRecord | null;
};

export type SleeperNflState = {
  season?: string | null;
  league_season?: string | null;
  display_week?: number | null;
  week?: number | null;
};

export type SleeperMatchup = {
  roster_id: number;
  matchup_id?: number | string | null;
  points?: number | string | null;
  starters?: string[] | null;
  players?: string[] | null;
  players_points?: Record<string, number | string | null> | null;
};


export type SleeperTransaction = {
  transaction_id: string;
  type?: string | null;
  status?: string | null;
  created?: number | null;
  roster_ids?: Array<number | string> | null;
  adds?: Record<string, number | string | null> | null;
  drops?: Record<string, number | string | null> | null;
  settings?: JsonRecord | null;
  waiver_budget?: Array<{ amount?: number | string | null; sender?: number | string | null; receiver?: number | string | null }> | null;
};

export type SleeperTrendingPlayer = {
  player_id: string;
  count?: number | string | null;
};
export type SleeperPlayer = {
  player_id?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  team?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  status?: string | null;
  injury_status?: string | null;
  search_rank?: number | null;
  sport?: string | null;
  active?: boolean | null;
};

export type SleeperPlayerMap = Record<string, SleeperPlayer>;

export type SleeperTeamManagerStateInput = {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperUser[];
  players: SleeperPlayerMap;
  userRosterId?: string | null;
  week?: number | null;
};

export type SleeperTeamWeekContextInput = {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperUser[];
  players: SleeperPlayerMap;
  matchups: SleeperMatchup[];
  userRosterId?: string | null;
  week: number;
};
export type SleeperDraftStateInput = {
  draft: SleeperDraft;
  picks: SleeperPick[];
  tradedPicks?: SleeperTradedPick[];
  players: SleeperPlayerMap;
  league?: SleeperLeague | null;
  rosters?: SleeperRoster[];
  users?: SleeperUser[];
  userRosterId?: string | null;
};

type CachedPlayers = {
  loadedAt: number;
  players: SleeperPlayerMap;
};

let playerCache: CachedPlayers | null = null;

export class SleeperApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SleeperApiError";
  }
}

export class SleeperClient {
  constructor(private readonly baseUrl = sleeperApiBaseUrl) {}

  async getUser(usernameOrUserId: string): Promise<SleeperUser> {
    return this.fetchJson<SleeperUser>(`/user/${encodeURIComponent(usernameOrUserId)}`);
  }

  async getNflState(): Promise<SleeperNflState> {
    return this.fetchJson<SleeperNflState>("/state/nfl");
  }

  async getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    return this.fetchJson<SleeperLeague[]>(`/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`);
  }

  async getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    return this.fetchJson<SleeperDraft[]>(`/league/${encodeURIComponent(leagueId)}/drafts`);
  }

  async getTeamManagerState(leagueId: string, userRosterId?: string | null): Promise<TeamManagerState> {
    const [leagueBundle, players, nflState] = await Promise.all([
      this.getLeagueBundle(leagueId),
      this.getPlayers(),
      this.getNflState().catch(() => null),
    ]);

    return normalizeSleeperTeamManagerState({
      league: leagueBundle.league,
      rosters: leagueBundle.rosters,
      users: leagueBundle.users,
      players,
      userRosterId,
      week: nflState?.display_week ?? nflState?.week ?? null,
    });
  }

  async getAvailablePlayers(leagueId: string, limit = 160): Promise<Player[]> {
    const [leagueBundle, players] = await Promise.all([
      this.getLeagueBundle(leagueId),
      this.getPlayers(),
    ]);

    return normalizeSleeperAvailablePlayers({
      rosters: leagueBundle.rosters,
      players,
      limit,
    });
  }


  async getTeamActivitySummary(leagueId: string, week?: number | null): Promise<TeamActivitySummary> {
    const [players, nflState] = await Promise.all([
      this.getPlayers(),
      week ? Promise.resolve(null) : this.getNflState().catch(() => null),
    ]);
    const resolvedWeek = week ?? nflState?.display_week ?? nflState?.week ?? null;
    const [transactions, trendingAdds, trendingDrops] = await Promise.all([
      resolvedWeek ? this.getLeagueTransactions(leagueId, resolvedWeek).catch(() => []) : Promise.resolve([]),
      this.getTrendingPlayers("add", 24, 25).catch(() => []),
      this.getTrendingPlayers("drop", 24, 25).catch(() => []),
    ]);

    return normalizeSleeperActivitySummary({
      players,
      transactions,
      trendingAdds,
      trendingDrops,
      week: resolvedWeek,
    });
  }
  async getTeamWeekContext(leagueId: string, week?: number | null, userRosterId?: string | null): Promise<TeamWeekContext | null> {
    const [leagueBundle, players, nflState] = await Promise.all([
      this.getLeagueBundle(leagueId),
      this.getPlayers(),
      week ? Promise.resolve(null) : this.getNflState().catch(() => null),
    ]);
    const resolvedWeek = week ?? nflState?.display_week ?? nflState?.week ?? null;
    if (!resolvedWeek) {
      return null;
    }

    const matchups = await this.getLeagueMatchups(leagueId, resolvedWeek);
    return normalizeSleeperTeamWeekContext({
      league: leagueBundle.league,
      rosters: leagueBundle.rosters,
      users: leagueBundle.users,
      players,
      matchups,
      userRosterId,
      week: resolvedWeek,
    });
  }

  async getDraftState(
    draftId: string,
    userRosterId?: string | null,
    userIdentifier?: string | null,
  ): Promise<DraftState> {
    const draft = await this.getDraft(draftId);
    const leagueId = draft.league_id ?? null;
    let resolvedUserTeamRef = userRosterId;
    if (!resolvedUserTeamRef && userIdentifier) {
      let userId = userIdentifier;
      if (!draft.draft_order?.[userId]) {
        userId = (await this.getUser(userIdentifier)).user_id;
      }
      resolvedUserTeamRef = getDraftUserTeamReference(draft, userId);
    }

    const [picks, tradedPicks, players, leagueBundle] = await Promise.all([
      this.getDraftPicks(draftId),
      this.getDraftTradedPicks(draftId).catch(() => []),
      this.getPlayers(),
      leagueId ? this.getLeagueBundle(leagueId) : Promise.resolve({ league: null, rosters: [], users: [] }),
    ]);

    return normalizeSleeperDraftState({
      draft,
      picks,
      tradedPicks,
      players,
      league: leagueBundle.league,
      rosters: leagueBundle.rosters,
      users: leagueBundle.users,
      userRosterId: resolvedUserTeamRef,
    });
  }

  async getDraft(draftId: string): Promise<SleeperDraft> {
    return this.fetchJson<SleeperDraft>(`/draft/${encodeURIComponent(draftId)}`);
  }

  async getDraftPicks(draftId: string): Promise<SleeperPick[]> {
    return this.fetchJson<SleeperPick[]>(`/draft/${encodeURIComponent(draftId)}/picks`);
  }

  async getDraftTradedPicks(draftId: string): Promise<SleeperTradedPick[]> {
    return this.fetchJson<SleeperTradedPick[]>(`/draft/${encodeURIComponent(draftId)}/traded_picks`);
  }

  async getLeague(leagueId: string): Promise<SleeperLeague> {
    return this.fetchJson<SleeperLeague>(`/league/${encodeURIComponent(leagueId)}`);
  }

  async getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    return this.fetchJson<SleeperRoster[]>(`/league/${encodeURIComponent(leagueId)}/rosters`);
  }

  async getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
    return this.fetchJson<SleeperUser[]>(`/league/${encodeURIComponent(leagueId)}/users`);
  }

  async getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return this.fetchJson<SleeperMatchup[]>(`/league/${encodeURIComponent(leagueId)}/matchups/${encodeURIComponent(String(week))}`);
  }

  async getLeagueTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
    return this.fetchJson<SleeperTransaction[]>(`/league/${encodeURIComponent(leagueId)}/transactions/${encodeURIComponent(String(week))}`);
  }

  async getTrendingPlayers(type: "add" | "drop", lookbackHours = 24, limit = 25): Promise<SleeperTrendingPlayer[]> {
    return this.fetchJson<SleeperTrendingPlayer[]>(`/players/nfl/trending/${type}?lookback_hours=${encodeURIComponent(String(lookbackHours))}&limit=${encodeURIComponent(String(limit))}`);
  }

  async getPlayers(): Promise<SleeperPlayerMap> {
    if (playerCache && Date.now() - playerCache.loadedAt < playerCacheTtlMs) {
      return playerCache.players;
    }

    const players = await this.fetchJson<SleeperPlayerMap>("/players/nfl");
    playerCache = {
      loadedAt: Date.now(),
      players,
    };
    return players;
  }

  private async getLeagueBundle(leagueId: string) {
    const [league, rosters, users] = await Promise.all([
      this.getLeague(leagueId),
      this.getLeagueRosters(leagueId),
      this.getLeagueUsers(leagueId),
    ]);

    return { league, rosters, users };
  }

  private async fetchJson<T>(path: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= sleeperRequestAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), sleeperRequestTimeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          headers: {
            Accept: "application/json",
            "User-Agent": "sleeper-ai-team-manager-local",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = new SleeperApiError(`Sleeper API returned ${response.status} for ${path}.`, response.status);
          if (!isRetryableSleeperStatus(response.status) || attempt === sleeperRequestAttempts) {
            throw error;
          }
          lastError = error;
        } else {
          return response.json() as Promise<T>;
        }
      } catch (error) {
        if (error instanceof SleeperApiError && !isRetryableSleeperStatus(error.status)) {
          throw error;
        }
        lastError = error;
        if (attempt === sleeperRequestAttempts) {
          break;
        }
      } finally {
        clearTimeout(timeout);
      }

      await delay(150 * attempt);
    }

    const reason = lastError instanceof Error && lastError.name === "AbortError"
      ? "request timed out"
      : "network request failed";
    throw new SleeperApiError(`Could not reach Sleeper (${reason}). Check your connection and try again.`);
  }

  async getProjectionImportPlayers(): Promise<Player[]> {
    const players = await this.getPlayers();
    return Object.values(players)
      .filter((player) => player.sport === "nfl" && player.player_id)
      .map(toPlayer)
      .filter(isPresent)
      .sort(compareSleeperPlayers);
  }
}

function isRetryableSleeperStatus(status?: number) {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}



export function normalizeSleeperActivitySummary(input: {
  players: SleeperPlayerMap;
  transactions: SleeperTransaction[];
  trendingAdds: SleeperTrendingPlayer[];
  trendingDrops: SleeperTrendingPlayer[];
  week?: number | null;
}): TeamActivitySummary {
  const recentTransactions = input.transactions
    .filter((transaction) => transaction.status === "complete" || transaction.status === "pending")
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, 10)
    .map((transaction) => normalizeTransactionItem(transaction, input.players));
  const trendingAdds = normalizeTrendingPlayers(input.trendingAdds, input.players, "add");
  const trendingDrops = normalizeTrendingPlayers(input.trendingDrops, input.players, "drop");
  const facts = buildActivityFacts(recentTransactions, trendingAdds, trendingDrops);

  return {
    headline: facts[0] ?? "No recent Sleeper activity is available yet.",
    week: input.week ?? null,
    recentTransactions,
    trendingAdds,
    trendingDrops,
    facts,
    limitations: [
      "Sleeper activity reflects transactions and trending add/drop counts, not projections or news analysis.",
      "Trending data is global Sleeper activity and may not reflect this league's waivers.",
      "Transaction data is read-only; this app does not submit adds, drops, trades, or bids.",
    ],
    updatedAt: new Date().toISOString(),
  };
}
export function normalizeSleeperAvailablePlayers(input: { rosters: SleeperRoster[]; players: SleeperPlayerMap; limit?: number }): Player[] {
  const rosteredIds = new Set(
    input.rosters.flatMap((roster) => [
      ...(roster.players ?? []),
      ...(roster.starters ?? []),
      ...(roster.reserve ?? []),
      ...(roster.taxi ?? []),
    ]).map(String).filter((playerId) => playerId && playerId !== "0"),
  );

  return Object.values(input.players)
    .filter((player) => player.sport === "nfl" && player.active !== false && player.player_id && !rosteredIds.has(player.player_id))
    .map(toPlayer)
    .filter(isPresent)
    .sort(compareSleeperPlayers)
    .slice(0, input.limit ?? 160);
}

function normalizeTransactionItem(transaction: SleeperTransaction, players: SleeperPlayerMap): TeamActivitySummary["recentTransactions"][number] {
  const addedPlayers = Object.keys(transaction.adds ?? {}).map((playerId) => toActivityPlayer(playerId, players)).filter(isPresent);
  const droppedPlayers = Object.keys(transaction.drops ?? {}).map((playerId) => toActivityPlayer(playerId, players)).filter(isPresent);
  const waiverBid = numberFrom(transaction.settings?.waiver_bid) ?? numberFrom(transaction.waiver_budget?.[0]?.amount);
  const type = transaction.type ?? "unknown";
  const descriptionParts: string[] = [];
  if (addedPlayers.length) {
    descriptionParts.push(`added ${addedPlayers.map((player) => player.name).join(", ")}`);
  }
  if (droppedPlayers.length) {
    descriptionParts.push(`dropped ${droppedPlayers.map((player) => player.name).join(", ")}`);
  }
  if (!descriptionParts.length) {
    descriptionParts.push(type.replace("_", " "));
  }

  return {
    id: transaction.transaction_id,
    type,
    status: transaction.status ?? "unknown",
    createdAt: transaction.created ? new Date(transaction.created).toISOString() : null,
    rosterIds: (transaction.roster_ids ?? []).map(String),
    addedPlayers,
    droppedPlayers,
    waiverBid,
    description: `${type.replace("_", " ")}: ${descriptionParts.join("; ")}${waiverBid !== null ? ` for $${waiverBid}` : ""}`,
  };
}

function normalizeTrendingPlayers(source: SleeperTrendingPlayer[], players: SleeperPlayerMap, direction: "add" | "drop"): TeamActivitySummary["trendingAdds"] {
  return source
    .map((item) => {
      const player = toActivityPlayer(item.player_id, players);
      if (!player) {
        return null;
      }
      return {
        player,
        count: numberFrom(item.count),
        direction,
      };
    })
    .filter(isPresent)
    .slice(0, 10);
}

function toActivityPlayer(playerId: string, players: SleeperPlayerMap): Player | null {
  const rawPlayer = players[playerId];
  return rawPlayer ? toPlayer(rawPlayer) : null;
}

function buildActivityFacts(
  recentTransactions: TeamActivitySummary["recentTransactions"],
  trendingAdds: TeamActivitySummary["trendingAdds"],
  trendingDrops: TeamActivitySummary["trendingDrops"],
): string[] {
  const facts: string[] = [];
  if (recentTransactions.length) {
    facts.push(`${recentTransactions.length} recent league transaction${recentTransactions.length === 1 ? "" : "s"} loaded.`);
  }
  if (trendingAdds[0]) {
    facts.push(`Top global add: ${trendingAdds[0].player.name}${trendingAdds[0].count !== null ? ` (${trendingAdds[0].count} adds)` : ""}.`);
  }
  if (trendingDrops[0]) {
    facts.push(`Top global drop: ${trendingDrops[0].player.name}${trendingDrops[0].count !== null ? ` (${trendingDrops[0].count} drops)` : ""}.`);
  }
  if (!facts.length) {
    facts.push("No recent Sleeper transaction or trending activity is available yet.");
  }
  return facts;
}
export function normalizeSleeperTeamManagerState(input: SleeperTeamManagerStateInput): TeamManagerState {
  const userRoster = getTeamManagerRoster(input.rosters, input.userRosterId);
  const userById = new Map(input.users.map((user) => [user.user_id, user]));
  const owner = userRoster.owner_id ? userById.get(userRoster.owner_id) : undefined;
  const rosterPlayerIds = uniqueStrings(userRoster.players ?? []);
  const starterIds = uniqueStrings(userRoster.starters ?? []).filter((playerId) => playerId !== "0");
  const reserveIds = new Set(uniqueStrings(userRoster.reserve ?? []));
  const taxiIds = new Set(uniqueStrings(userRoster.taxi ?? []));
  const playerById = new Map(
    rosterPlayerIds
      .map((playerId) => input.players[playerId] ? toPlayer(input.players[playerId]) : null)
      .filter(isPresent)
      .map((player) => [player.id, player]),
  );
  const rosterPlayers = rosterPlayerIds.map((playerId) => playerById.get(playerId)).filter(isPresent);
  const starterSlots = getStarterSlots(input.league.roster_positions ?? []);
  const starters = starterSlots.map((slot, index) => {
    const playerId = starterIds[index];
    return {
      slot,
      eligiblePositions: getEligiblePositions(slot),
      player: playerId ? playerById.get(playerId) ?? null : null,
    };
  });
  const assignedStarterIds = new Set(starterIds);
  const injuredReserve = rosterPlayerIds.map((playerId) => playerById.get(playerId)).filter(isPresent).filter((player) => reserveIds.has(player.id));
  const taxi = rosterPlayerIds.map((playerId) => playerById.get(playerId)).filter(isPresent).filter((player) => taxiIds.has(player.id));
  const bench = rosterPlayerIds
    .map((playerId) => playerById.get(playerId))
    .filter(isPresent)
    .filter((player) => !assignedStarterIds.has(player.id) && !reserveIds.has(player.id) && !taxiIds.has(player.id));
  const scoring = getLeagueScoringLabel(input.league);
  const rosterSlots = getLeagueRosterSlots(input.league);
  const scoringSettings = getNumericScoringSettings(input.league.scoring_settings);
  const formatCompatibility = assessFormatCompatibility({ scoring, scoringSettings, rosterSlots });

  return {
    league: {
      id: input.league.league_id,
      name: input.league.name ?? `League ${input.league.league_id}`,
      season: input.league.season ?? null,
      status: input.league.status ?? "unknown",
      teams: input.league.total_rosters ?? input.rosters.length,
      scoring,
      rosterSlots,
      formatCompatibility,
    },
    userTeam: {
      rosterId: String(userRoster.roster_id),
      ownerId: userRoster.owner_id ?? null,
      name: getTeamName(owner, `Roster ${userRoster.roster_id}`),
    },
    roster: {
      starters,
      bench,
      injuredReserve,
      taxi,
      positionCounts: countPlayersByPosition(rosterPlayers),
    },
    week: input.week ?? null,
    updatedAt: new Date().toISOString(),
    dataQuality: {
      playerValueSource: "Sleeper roster and player metadata. This is roster visibility, not projections.",
      limitations: [
        "Sleeper roster data does not include full fantasy projections.",
        "Starter slots reflect Sleeper starter IDs when available and roster settings otherwise.",
        ...formatCompatibility.warnings,
      ],
    },
  };
}


export function normalizeSleeperTeamWeekContext(input: SleeperTeamWeekContextInput): TeamWeekContext | null {
  const userRoster = getTeamManagerRoster(input.rosters, input.userRosterId);
  const userMatchup = input.matchups.find((matchup) => matchup.roster_id === userRoster.roster_id);
  if (!userMatchup) {
    return null;
  }

  const matchupId = numberFrom(userMatchup.matchup_id);
  const opponentMatchup = matchupId
    ? input.matchups.find((matchup) => matchup.roster_id !== userRoster.roster_id && numberFrom(matchup.matchup_id) === matchupId)
    : undefined;
  const opponentRoster = opponentMatchup
    ? input.rosters.find((roster) => roster.roster_id === opponentMatchup.roster_id)
    : undefined;
  const userById = new Map(input.users.map((user) => [user.user_id, user]));
  const userOwner = userRoster.owner_id ? userById.get(userRoster.owner_id) : undefined;
  const opponentOwner = opponentRoster?.owner_id ? userById.get(opponentRoster.owner_id) : undefined;
  const userPoints = numberFrom(userMatchup.points);
  const opponentPoints = numberFrom(opponentMatchup?.points);
  const userTeamName = getTeamName(userOwner, `Roster ${userRoster.roster_id}`);
  const opponentTeamName = opponentRoster ? getTeamName(opponentOwner, `Roster ${opponentRoster.roster_id}`) : null;
  const facts = [`Week ${input.week} Sleeper matchup data is loaded.`];
  if (opponentTeamName) {
    facts.push(`Opponent: ${opponentTeamName}.`);
  }
  if (userPoints !== null || opponentPoints !== null) {
    facts.push(`Current Sleeper score: ${formatNullablePoints(userPoints)} to ${formatNullablePoints(opponentPoints)}.`);
  }

  return {
    week: input.week,
    matchupId,
    status: getMatchupStatus(userPoints, opponentPoints),
    userRosterId: String(userRoster.roster_id),
    opponentRosterId: opponentRoster ? String(opponentRoster.roster_id) : null,
    userTeamName,
    opponentTeamName,
    userPoints,
    opponentPoints,
    userStarters: buildWeekPlayers(userMatchup, input.league, input.players),
    opponentStarters: opponentMatchup ? buildWeekPlayers(opponentMatchup, input.league, input.players) : [],
    facts,
    limitations: [
      "Sleeper matchup data is current lineup and points state, not a projection model.",
      "Points may be empty or partial before games finish.",
    ],
    updatedAt: new Date().toISOString(),
  };
}

function compareSleeperPlayers(a: Player, b: Player): number {
  const aRank = a.adp ?? Number.MAX_SAFE_INTEGER;
  const bRank = b.adp ?? Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) {
    return aRank - bRank;
  }
  if (a.projectedPoints !== b.projectedPoints) {
    return b.projectedPoints - a.projectedPoints;
  }
  return a.name.localeCompare(b.name);
}
function getTeamManagerRoster(rosters: SleeperRoster[], userRosterId: string | null | undefined): SleeperRoster {
  if (rosters.length === 0) {
    throw new Error("Sleeper league has no rosters to load.");
  }

  const normalizedRosterId = normalizeNullableString(userRosterId)?.replace(/^roster-/, "");
  if (!normalizedRosterId) {
    return rosters[0]!;
  }

  return rosters.find((roster) => String(roster.roster_id) === normalizedRosterId) ?? rosters[0]!;
}

function getStarterSlots(rosterPositions: string[]): string[] {
  return rosterPositions.map(normalizeRosterSlot).filter((slot) => !["BN", "IR", "TAXI"].includes(slot));
}

function getEligiblePositions(slot: string): string[] {
  if (slot === "FLEX" || slot === "WR_RB_FLEX" || slot === "REC_FLEX") {
    return ["RB", "WR", "TE"];
  }

  if (slot === "SUPER_FLEX" || slot === "SF") {
    return ["QB", "RB", "WR", "TE"];
  }

  return [slot];
}

function countPlayersByPosition(players: Player[]): Record<Position, number> {
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const player of players) {
    counts[player.position] += 1;
  }
  return counts;
}


function buildWeekPlayers(matchup: SleeperMatchup, league: SleeperLeague, players: SleeperPlayerMap): TeamWeekPlayer[] {
  const starterSlots = getStarterSlots(league.roster_positions ?? []);
  return uniqueStrings(matchup.starters ?? [])
    .filter((playerId) => playerId !== "0")
    .map((playerId, index) => {
      const player = players[playerId] ? toPlayer(players[playerId]) : null;
      if (!player) {
        return null;
      }

      return {
        playerId,
        name: player.name,
        team: player.team,
        position: player.position,
        slot: starterSlots[index] ?? null,
        points: numberFrom(matchup.players_points?.[playerId]),
      };
    })
    .filter(isPresent);
}

function getMatchupStatus(userPoints: number | null, opponentPoints: number | null): TeamWeekContext["status"] {
  if ((userPoints ?? 0) > 0 || (opponentPoints ?? 0) > 0) {
    return "in_progress";
  }

  return "scheduled";
}

function formatNullablePoints(points: number | null): string {
  return points === null ? "not scored" : points.toFixed(2);
}
function getLeagueScoringLabel(league: SleeperLeague): string {
  const receptions = numberFrom(league.scoring_settings?.rec);
  if (receptions === 1) {
    return "PPR";
  }

  if (receptions === 0.5) {
    return "Half PPR";
  }

  if (receptions === 0) {
    return "Standard";
  }

  return "Custom";
}

function getLeagueRosterSlots(league: SleeperLeague): Record<string, number> {
  const rosterPositions = league.roster_positions ?? [];
  return rosterPositions.length > 0 ? countRosterPositions(rosterPositions) : { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, BN: 6 };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(String).filter(Boolean)));
}
export function normalizeSleeperDraftState(input: SleeperDraftStateInput): DraftState {
  const teamsCount = getTeamsCount(input);
  const rounds = getRounds(input, teamsCount);
  const teams = buildTeams(input, teamsCount);
  const picks = buildPicks(input.picks, teams, teamsCount, input.rosters ?? []);
  const playerPool = buildPlayerPool(input.players, input.picks);
  const userTeamId = getUserTeamId(teams, input.userRosterId);
  const totalPicks = teamsCount * rounds;

  return {
    id: input.draft.draft_id,
    leagueId: input.draft.league_id ?? input.league?.league_id ?? null,
    name: buildDraftName(input),
    status: normalizeDraftStatus(input.draft.status, picks.length, totalPicks),
    currentPick: Math.min(picks.length + 1, totalPicks || picks.length + 1),
    userTeamId,
    settings: buildDraftSettings(input, teamsCount, rounds),
    teams: hydrateTeamRosters(teams, picks),
    players: playerPool,
    picks,
    pickOrder: buildDraftPickOrder(input, teams, teamsCount, rounds, picks),
    updatedAt: new Date().toISOString(),
  };
}

function getTeamsCount(input: SleeperDraftStateInput): number {
  const settings = input.draft.settings ?? {};
  const explicitTeams = numberFrom(settings.teams);
  const slotMappedTeams = Object.keys(input.draft.slot_to_roster_id ?? {}).length;

  return firstPositiveNumber(explicitTeams, input.league?.total_rosters, slotMappedTeams, input.rosters?.length, 12);
}

function getRounds(input: SleeperDraftStateInput, teamsCount: number): number {
  const settings = input.draft.settings ?? {};
  const rosterSlots = input.league?.roster_positions?.length;
  return numberFrom(settings.rounds) ?? rosterSlots ?? Math.max(1, Math.ceil(input.picks.length / teamsCount));
}

function buildDraftName(input: SleeperDraftStateInput): string {
  if (input.league?.name) {
    return input.league.name;
  }

  const metadataName = stringFrom(input.draft.metadata?.name);
  if (metadataName) {
    return metadataName;
  }

  return `Sleeper Draft ${input.draft.draft_id}`;
}

function buildDraftSettings(input: SleeperDraftStateInput, teams: number, rounds: number): DraftSettings {
  const scoring = getScoringLabel(input);
  const scoringSettings = getNumericScoringSettings(input.league?.scoring_settings);
  const rosterSlots = getRosterSlots(input);
  return {
    teams,
    rounds,
    scoring,
    scoringSettings,
    rosterSlots,
    formatCompatibility: assessFormatCompatibility({
      scoring,
      scoringSettings,
      rosterSlots,
      draftType: input.draft.type,
    }),
  };
}

function getNumericScoringSettings(settings: JsonRecord | null | undefined): Record<string, number> {
  return Object.fromEntries(
    Object.entries(settings ?? {})
      .map(([key, value]) => [key, numberFrom(value)] as const)
      .filter((entry): entry is [string, number] => entry[1] !== null),
  );
}

function getScoringLabel(input: SleeperDraftStateInput): string {
  const metadataScoring = stringFrom(input.draft.metadata?.scoring_type);
  if (metadataScoring) {
    return metadataScoring;
  }

  const receptions = numberFrom(input.league?.scoring_settings?.rec);
  if (receptions === 1) {
    return "PPR";
  }

  if (receptions === 0.5) {
    return "Half PPR";
  }

  if (receptions === 0) {
    return "Standard";
  }

  return "Custom";
}

function getRosterSlots(input: SleeperDraftStateInput): Record<string, number> {
  const fromLeague = input.league?.roster_positions;
  if (fromLeague && fromLeague.length > 0) {
    return countRosterPositions(fromLeague);
  }

  const settings = input.draft.settings ?? {};
  const slots: Record<string, number> = {};
  const settingAliases: Record<string, string> = {
    slots_qb: "QB",
    slots_rb: "RB",
    slots_wr: "WR",
    slots_te: "TE",
    slots_flex: "FLEX",
    slots_super_flex: "SUPER_FLEX",
    slots_bn: "BN",
    slots_k: "K",
    slots_def: "DEF",
  };

  for (const [source, target] of Object.entries(settingAliases)) {
    const value = numberFrom(settings[source]);
    if (value && value > 0) {
      slots[target] = value;
    }
  }

  return Object.keys(slots).length > 0 ? slots : { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, BN: 6 };
}

function countRosterPositions(rosterPositions: string[]): Record<string, number> {
  const slots: Record<string, number> = {};

  for (const rawSlot of rosterPositions) {
    const slot = normalizeRosterSlot(rawSlot);
    slots[slot] = (slots[slot] ?? 0) + 1;
  }

  return slots;
}

function normalizeRosterSlot(slot: string): string {
  if (slot === "BE") {
    return "BN";
  }

  return slot;
}

function normalizeDraftStatus(rawStatus: string | null | undefined, picksCount: number, totalPicks: number): DraftState["status"] {
  if (rawStatus === "complete" || (totalPicks > 0 && picksCount >= totalPicks)) {
    return "complete";
  }

  if (rawStatus === "pre_draft" || rawStatus === "created") {
    return "pre_draft";
  }

  return "drafting";
}

function buildTeams(input: SleeperDraftStateInput, teamsCount: number): Team[] {
  const rosterById = new Map((input.rosters ?? []).map((roster) => [String(roster.roster_id), roster]));
  const userById = new Map((input.users ?? []).map((user) => [user.user_id, user]));

  return Array.from({ length: teamsCount }, (_, index) => {
    const draftSlot = index + 1;
    const rosterId = getRosterIdForSlot(input, draftSlot);
    const roster = rosterId ? rosterById.get(rosterId) : undefined;
    const user = roster?.owner_id ? userById.get(roster.owner_id) : undefined;
    const fallbackName = rosterId ? `Roster ${rosterId}` : `Slot ${draftSlot}`;

    return {
      id: rosterId ? toRosterTeamId(rosterId) : toSlotTeamId(draftSlot),
      name: getTeamName(user, fallbackName),
      draftSlot,
      roster: [],
    };
  });
}

function getTeamName(user: SleeperUser | undefined, fallback: string): string {
  if (!user) {
    return fallback;
  }

  const teamName = stringFrom(user.metadata?.team_name);
  return teamName ?? user.display_name ?? user.username ?? fallback;
}

function getRosterIdForSlot(input: SleeperDraftStateInput, slot: number): string | null {
  const mapped = input.draft.slot_to_roster_id?.[String(slot)];
  if (mapped !== undefined && mapped !== null) {
    return String(mapped);
  }

  if (input.draft.draft_order) {
    for (const [ownerUserId, draftSlot] of Object.entries(input.draft.draft_order)) {
      if (numberFrom(draftSlot) === slot) {
        const roster = input.rosters?.find((candidate) => candidate.owner_id === ownerUserId);
        return roster ? String(roster.roster_id) : null;
      }
    }
  }

  return null;
}

function buildPicks(rawPicks: SleeperPick[], teams: Team[], teamsCount: number, rosters: SleeperRoster[]): Pick[] {
  const teamByRosterId = new Map<string, Team>();
  const teamBySlot = new Map<number, Team>();
  const teamByOwnerId = new Map<string, Team>();

  for (const team of teams) {
    teamBySlot.set(team.draftSlot, team);
    if (team.id.startsWith("roster-")) {
      const rosterId = team.id.replace("roster-", "");
      teamByRosterId.set(rosterId, team);
      const roster = rosters.find((candidate) => String(candidate.roster_id) === rosterId);
      if (roster?.owner_id) {
        teamByOwnerId.set(roster.owner_id, team);
      }
    }
  }

  return rawPicks
    .filter((pick) => Boolean(pick.player_id))
    .map((pick, index) => {
      const pickNo = numberFrom(pick.pick_no) ?? index + 1;
      const round = numberFrom(pick.round) ?? Math.ceil(pickNo / teamsCount);
      const draftSlot = numberFrom(pick.draft_slot) ?? getDraftSlotFromPickNo(pickNo, teamsCount);
      const rosterId = pick.roster_id === undefined || pick.roster_id === null ? null : String(pick.roster_id);
      const pickedBy = pick.picked_by === undefined || pick.picked_by === null ? null : String(pick.picked_by);
      const team =
        (rosterId ? teamByRosterId.get(rosterId) : undefined) ??
        (pickedBy ? teamByOwnerId.get(pickedBy) : undefined) ??
        teamBySlot.get(draftSlot);

      return {
        pickNo,
        round,
        draftSlot,
        teamId: team?.id ?? toSlotTeamId(draftSlot),
        playerId: String(pick.player_id),
        ...(pick.is_keeper === true ? { isKeeper: true } : {}),
      };
    })
    .sort((a, b) => a.pickNo - b.pickNo);
}

function buildDraftPickOrder(
  input: SleeperDraftStateInput,
  teams: Team[],
  teamsCount: number,
  rounds: number,
  picks: Pick[],
): DraftPickOrder {
  if (input.draft.type?.toLowerCase() === "auction") {
    return { source: "unsupported", entries: [] };
  }

  const teamBySlot = new Map(teams.map((team) => [team.draftSlot, team]));
  const teamByRosterId = new Map(
    teams
      .filter((team) => team.id.startsWith("roster-"))
      .map((team) => [team.id.slice("roster-".length), team]),
  );
  const tradedOwners = new Map<string, string>();
  const draftSeason = input.draft.season ? String(input.draft.season) : null;

  for (const tradedPick of input.tradedPicks ?? []) {
    const season = tradedPick.season ? String(tradedPick.season) : null;
    const round = numberFrom(tradedPick.round);
    const originalRosterId = tradedPick.roster_id === undefined || tradedPick.roster_id === null
      ? null
      : String(tradedPick.roster_id);
    const ownerRosterId = tradedPick.owner_id === undefined || tradedPick.owner_id === null
      ? null
      : String(tradedPick.owner_id);
    if (season !== draftSeason || round === null || !originalRosterId || !ownerRosterId) {
      continue;
    }
    tradedOwners.set(`${round}:${originalRosterId}`, ownerRosterId);
  }

  const pickedByNumber = new Map(picks.map((pick) => [pick.pickNo, pick]));
  const totalPicks = teamsCount * rounds;
  const entries = Array.from({ length: totalPicks }, (_, index) => {
    const pickNo = index + 1;
    const round = Math.ceil(pickNo / teamsCount);
    const draftSlot = getDraftSlotFromPickNo(pickNo, teamsCount);
    const originalTeam = teamBySlot.get(draftSlot);
    const originalTeamId = originalTeam?.id ?? toSlotTeamId(draftSlot);
    const originalRosterId = originalTeamId.startsWith("roster-")
      ? originalTeamId.slice("roster-".length)
      : null;
    const tradedRosterId = originalRosterId ? tradedOwners.get(`${round}:${originalRosterId}`) : null;
    const tradedTeam = tradedRosterId ? teamByRosterId.get(tradedRosterId) : undefined;
    const picked = pickedByNumber.get(pickNo);
    const teamId = picked?.teamId ?? tradedTeam?.id ?? originalTeamId;

    return {
      pickNo,
      round,
      draftSlot,
      teamId,
      originalTeamId,
      isTraded: teamId !== originalTeamId,
    };
  });

  return { source: "sleeper", entries };
}

function getDraftSlotFromPickNo(pickNo: number, teamsCount: number): number {
  const round = Math.ceil(pickNo / teamsCount);
  const pickInRound = ((pickNo - 1) % teamsCount) + 1;
  return round % 2 === 1 ? pickInRound : teamsCount + 1 - pickInRound;
}

function hydrateTeamRosters(teams: Team[], picks: Pick[]): Team[] {
  const rosterByTeam = new Map<string, string[]>();

  for (const pick of picks) {
    const roster = rosterByTeam.get(pick.teamId) ?? [];
    roster.push(pick.playerId);
    rosterByTeam.set(pick.teamId, roster);
  }

  return teams.map((team) => ({
    ...team,
    roster: rosterByTeam.get(team.id) ?? [],
  }));
}

function buildPlayerPool(players: SleeperPlayerMap, picks: SleeperPick[]): Player[] {
  const pickedIds = new Set(picks.map((pick) => pick.player_id).filter(isPresent).map(String));
  const rawPlayers = Object.values(players)
    .filter((player) => {
      const playerId = player.player_id ? String(player.player_id) : null;
      return playerId ? pickedIds.has(playerId) || shouldIncludePlayer(player) : false;
    })
    .sort((a, b) => getSearchRank(a) - getSearchRank(b));

  const selected = new Map<string, SleeperPlayer>();
  for (const rawPlayer of rawPlayers) {
    const playerId = rawPlayer.player_id ? String(rawPlayer.player_id) : null;
    if (!playerId) {
      continue;
    }

    if (selected.size < playerPoolLimit || pickedIds.has(playerId)) {
      selected.set(playerId, rawPlayer);
    }
  }

  for (const pickedId of pickedIds) {
    if (!selected.has(pickedId) && players[pickedId]) {
      selected.set(pickedId, players[pickedId]);
    }
  }

  return Array.from(selected.values()).map(toPlayer).filter(isPresent);
}

function shouldIncludePlayer(player: SleeperPlayer): boolean {
  const position = getPlayerPosition(player);
  if (!position) {
    return false;
  }

  if (player.sport && player.sport !== "nfl") {
    return false;
  }

  const searchRank = numberFrom(player.search_rank);
  if (searchRank !== null && searchRank <= playerPoolLimit) {
    return true;
  }

  return position === "K" || position === "DEF";
}

function toPlayer(rawPlayer: SleeperPlayer): Player | null {
  const playerId = rawPlayer.player_id ? String(rawPlayer.player_id) : null;
  const position = getPlayerPosition(rawPlayer);
  if (!playerId || !position) {
    return null;
  }

  const searchRank = numberFrom(rawPlayer.search_rank);
  const riskTags = getRiskTags(rawPlayer);
  const baseline = positionBaselines[position];
  const rankBoost = searchRank === null ? 0 : Math.max(0, 70 - searchRank / 8);
  const positionCap = position === "K" || position === "DEF" ? 22 : 70;
  const projectedPoints = Number((baseline + Math.min(rankBoost, positionCap) - riskTags.length * 4).toFixed(1));

  return {
    id: playerId,
    sleeperId: playerId,
    name: getPlayerName(rawPlayer, playerId),
    team: rawPlayer.team ?? "FA",
    position,
    projectedPoints,
    projectionSource: "sleeper_search_rank",
    adp: searchRank && searchRank <= 400 ? searchRank : null,
    tier: searchRank ? Math.max(1, Math.ceil(searchRank / 24)) : null,
    riskTags,
  };
}

function getPlayerPosition(player: SleeperPlayer): Position | null {
  const fantasyPosition = player.fantasy_positions?.find((position) =>
    supportedPositions.has(position as Position),
  ) as Position | undefined;

  if (fantasyPosition) {
    return fantasyPosition;
  }

  const position = player.position as Position | undefined;
  return position && supportedPositions.has(position) ? position : null;
}

function getPlayerName(player: SleeperPlayer, fallback: string): string {
  if (player.full_name) {
    return player.full_name;
  }

  const parts = [player.first_name, player.last_name].filter(isPresent);
  return parts.length > 0 ? parts.join(" ") : fallback;
}

function getRiskTags(player: SleeperPlayer): string[] {
  const tags: string[] = [];
  const injuryStatus = normalizeNullableString(player.injury_status);
  const status = normalizeNullableString(player.status);

  if (injuryStatus) {
    tags.push(`injury: ${injuryStatus}`);
  }

  if (status && status !== "Active") {
    tags.push(`status: ${status}`);
  }

  return tags;
}

function getSearchRank(player: SleeperPlayer): number {
  return numberFrom(player.search_rank) ?? Number.MAX_SAFE_INTEGER;
}

function getUserTeamId(teams: Team[], userRosterId: string | null | undefined): string {
  const requested = normalizeNullableString(userRosterId);
  if (!requested) {
    return teams[0]?.id ?? "slot-1";
  }

  if (requested.startsWith("slot-")) {
    const requestedSlot = numberFrom(requested.replace("slot-", ""));
    const slotTeam = requestedSlot ? teams.find((team) => team.draftSlot === requestedSlot) : undefined;
    return slotTeam?.id ?? teams[0]?.id ?? "slot-1";
  }

  const requestedRosterId = requested.startsWith("roster-") ? requested.replace("roster-", "") : requested;
  const rosterTeam = teams.find((team) => team.id === toRosterTeamId(requestedRosterId));
  if (rosterTeam) {
    return rosterTeam.id;
  }

  const requestedSlot = numberFrom(requested);
  const slotTeam = requestedSlot ? teams.find((team) => team.draftSlot === requestedSlot) : undefined;
  return slotTeam?.id ?? teams[0]?.id ?? "slot-1";
}

export function getDraftUserTeamReference(draft: SleeperDraft, userId: string): string | null {
  const draftSlot = numberFrom(draft.draft_order?.[userId]);
  return draftSlot ? `slot-${draftSlot}` : null;
}

function toRosterTeamId(rosterId: string): string {
  return `roster-${rosterId}`;
}

function toSlotTeamId(slot: number): string {
  return `slot-${slot}`;
}

function firstPositiveNumber(...values: Array<number | null | undefined>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 12;
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "null" ? trimmed : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}









