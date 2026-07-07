import type { SleeperClient, SleeperDraft, SleeperLeague, SleeperRoster, SleeperUser } from "./sleeper";

export type SleeperConnectDraft = {
  draftId: string;
  name: string;
  status: string;
  type: string;
  season: string | null;
  teams: number | null;
  rounds: number | null;
  userDraftSlot: number | null;
};

export type SleeperConnectLeague = {
  leagueId: string;
  name: string;
  season: string | null;
  status: string;
  totalRosters: number | null;
  scoring: string;
  rosterSlots: Record<string, number>;
  userRosterId: string | null;
  drafts: SleeperConnectDraft[];
  recommendedDraftId: string | null;
};

export type SleeperConnectResponse = {
  user: {
    userId: string;
    username: string | null;
    displayName: string | null;
  };
  season: string;
  leagues: SleeperConnectLeague[];
};

type LeagueBundle = {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  drafts: SleeperDraft[];
};

export async function getSleeperConnectOptions(
  client: SleeperClient,
  usernameOrUserId: string,
  seasonOverride?: string | null,
  leagueIdOrUrl?: string | null,
): Promise<SleeperConnectResponse> {
  const user = await client.getUser(usernameOrUserId);
  const season = seasonOverride?.trim() || (await getCurrentLeagueSeason(client));
  const leagues = await client.getUserLeagues(user.user_id, season);
  const directLeagueId = extractSleeperLeagueId(leagueIdOrUrl);
  const leagueIds = new Set(leagues.map((league) => league.league_id));

  if (directLeagueId && !leagueIds.has(directLeagueId)) {
    leagues.unshift(await client.getLeague(directLeagueId));
  }

  const bundles = await Promise.all(leagues.map((league) => getLeagueBundle(client, league)));

  return buildSleeperConnectResponse(user, season, bundles);
}

export function buildSleeperConnectResponse(
  user: SleeperUser,
  season: string,
  bundles: LeagueBundle[],
): SleeperConnectResponse {
  return {
    user: {
      userId: user.user_id,
      username: user.username ?? null,
      displayName: user.display_name ?? null,
    },
    season,
    leagues: bundles.map((bundle) => toConnectLeague(user, bundle)),
  };
}

async function getLeagueBundle(client: SleeperClient, league: SleeperLeague): Promise<LeagueBundle> {
  const [rosters, drafts] = await Promise.all([
    client.getLeagueRosters(league.league_id),
    getLeagueDrafts(client, league),
  ]);

  return { league, rosters, drafts };
}

function extractSleeperLeagueId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/(?:sleeper\.com\/leagues\/)?(\d{10,})/);
  return match?.[1] ?? null;
}
async function getCurrentLeagueSeason(client: SleeperClient): Promise<string> {
  const state = await client.getNflState();
  return state.league_season ?? state.season ?? String(new Date().getFullYear());
}

async function getLeagueDrafts(client: SleeperClient, league: SleeperLeague): Promise<SleeperDraft[]> {
  const drafts = await client.getLeagueDrafts(league.league_id);
  if (drafts.length > 0 || !league.draft_id) {
    return drafts;
  }

  return [await client.getDraft(league.draft_id)];
}

function toConnectLeague(user: SleeperUser, bundle: LeagueBundle): SleeperConnectLeague {
  const userRoster = bundle.rosters.find((roster) => roster.owner_id === user.user_id);
  const userRosterId = userRoster ? String(userRoster.roster_id) : null;
  const drafts = bundle.drafts.map((draft) => toConnectDraft(draft, user.user_id, userRosterId));

  return {
    leagueId: bundle.league.league_id,
    name: bundle.league.name ?? `League ${bundle.league.league_id}`,
    season: bundle.league.season ?? null,
    status: bundle.league.status ?? "unknown",
    totalRosters: bundle.league.total_rosters ?? null,
    scoring: getScoringLabel(bundle.league),
    rosterSlots: getRosterSlots(bundle.league),
    userRosterId,
    drafts,
    recommendedDraftId: getRecommendedDraftId(drafts),
  };
}

function toConnectDraft(draft: SleeperDraft, userId: string, userRosterId: string | null): SleeperConnectDraft {
  return {
    draftId: draft.draft_id,
    name: stringFrom(draft.metadata?.name) ?? `Draft ${draft.draft_id}`,
    status: draft.status ?? "unknown",
    type: draft.type ?? "unknown",
    season: draft.season ?? null,
    teams: numberFrom(draft.settings?.teams),
    rounds: numberFrom(draft.settings?.rounds),
    userDraftSlot: getUserDraftSlot(draft, userId, userRosterId),
  };
}

function getRecommendedDraftId(drafts: SleeperConnectDraft[]): string | null {
  const activeDraft = drafts.find((draft) => draft.status === "drafting" || draft.status === "pre_draft");
  const incompleteDraft = drafts.find((draft) => draft.status !== "complete");
  return activeDraft?.draftId ?? incompleteDraft?.draftId ?? drafts[0]?.draftId ?? null;
}

function getUserDraftSlot(draft: SleeperDraft, userId: string, userRosterId: string | null): number | null {
  if (userRosterId && draft.slot_to_roster_id) {
    for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id)) {
      if (String(rosterId) === userRosterId) {
        return numberFrom(slot);
      }
    }
  }

  const draftSlot = draft.draft_order?.[userId];
  return numberFrom(draftSlot);
}

function getScoringLabel(league: SleeperLeague): string {
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

function getRosterSlots(league: SleeperLeague): Record<string, number> {
  const rosterPositions = league.roster_positions ?? [];
  const slots: Record<string, number> = {};

  for (const rawSlot of rosterPositions) {
    const slot = rawSlot === "BE" ? "BN" : rawSlot;
    slots[slot] = (slots[slot] ?? 0) + 1;
  }

  return slots;
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