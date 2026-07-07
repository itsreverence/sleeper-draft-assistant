import type { DraftSettings, DraftState, Pick, Player, Position, Team } from "@sleeper-ai/shared";

const sleeperApiBaseUrl = "https://api.sleeper.app/v1";
const playerCacheTtlMs = 24 * 60 * 60 * 1000;
const playerPoolLimit = 700;

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
  metadata?: JsonRecord | null;
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

export type SleeperDraftStateInput = {
  draft: SleeperDraft;
  picks: SleeperPick[];
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

  async getDraftState(draftId: string, userRosterId?: string | null): Promise<DraftState> {
    const draft = await this.getDraft(draftId);
    const leagueId = draft.league_id ?? null;

    const [picks, players, leagueBundle] = await Promise.all([
      this.getDraftPicks(draftId),
      this.getPlayers(),
      leagueId ? this.getLeagueBundle(leagueId) : Promise.resolve({ league: null, rosters: [], users: [] }),
    ]);

    return normalizeSleeperDraftState({
      draft,
      picks,
      players,
      league: leagueBundle.league,
      rosters: leagueBundle.rosters,
      users: leagueBundle.users,
      userRosterId,
    });
  }

  async getDraft(draftId: string): Promise<SleeperDraft> {
    return this.fetchJson<SleeperDraft>(`/draft/${encodeURIComponent(draftId)}`);
  }

  async getDraftPicks(draftId: string): Promise<SleeperPick[]> {
    return this.fetchJson<SleeperPick[]>(`/draft/${encodeURIComponent(draftId)}/picks`);
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
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "sleeper-ai-team-manager-local",
      },
    });

    if (!response.ok) {
      throw new SleeperApiError(`Sleeper API returned ${response.status} for ${path}.`, response.status);
    }

    return response.json() as Promise<T>;
  }
}

export function normalizeSleeperDraftState(input: SleeperDraftStateInput): DraftState {
  const teamsCount = getTeamsCount(input);
  const rounds = getRounds(input, teamsCount);
  const teams = buildTeams(input, teamsCount);
  const picks = buildPicks(input.picks, teams, teamsCount);
  const playerPool = buildPlayerPool(input.players, input.picks);
  const userTeamId = getUserTeamId(teams, input.userRosterId);
  const totalPicks = teamsCount * rounds;

  return {
    id: input.draft.draft_id,
    name: buildDraftName(input),
    status: normalizeDraftStatus(input.draft.status, picks.length, totalPicks),
    currentPick: Math.min(picks.length + 1, totalPicks || picks.length + 1),
    userTeamId,
    settings: buildDraftSettings(input, teamsCount, rounds),
    teams: hydrateTeamRosters(teams, picks),
    players: playerPool,
    picks,
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
  return {
    teams,
    rounds,
    scoring: getScoringLabel(input),
    rosterSlots: getRosterSlots(input),
  };
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

function buildPicks(rawPicks: SleeperPick[], teams: Team[], teamsCount: number): Pick[] {
  const teamByRosterId = new Map<string, Team>();
  const teamBySlot = new Map<number, Team>();

  for (const team of teams) {
    teamBySlot.set(team.draftSlot, team);
    if (team.id.startsWith("roster-")) {
      teamByRosterId.set(team.id.replace("roster-", ""), team);
    }
  }

  return rawPicks
    .filter((pick) => Boolean(pick.player_id))
    .map((pick, index) => {
      const pickNo = numberFrom(pick.pick_no) ?? index + 1;
      const round = numberFrom(pick.round) ?? Math.ceil(pickNo / teamsCount);
      const draftSlot = numberFrom(pick.draft_slot) ?? getDraftSlotFromPickNo(pickNo, teamsCount);
      const rosterId = pick.roster_id === undefined || pick.roster_id === null ? null : String(pick.roster_id);
      const team = (rosterId ? teamByRosterId.get(rosterId) : undefined) ?? teamBySlot.get(draftSlot);

      return {
        pickNo,
        round,
        draftSlot,
        teamId: team?.id ?? toSlotTeamId(draftSlot),
        playerId: String(pick.player_id),
      };
    })
    .sort((a, b) => a.pickNo - b.pickNo);
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

  const requestedRosterId = requested.startsWith("roster-") ? requested.replace("roster-", "") : requested;
  const rosterTeam = teams.find((team) => team.id === toRosterTeamId(requestedRosterId));
  if (rosterTeam) {
    return rosterTeam.id;
  }

  const requestedSlot = numberFrom(requested);
  const slotTeam = requestedSlot ? teams.find((team) => team.draftSlot === requestedSlot) : undefined;
  return slotTeam?.id ?? teams[0]?.id ?? "slot-1";
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