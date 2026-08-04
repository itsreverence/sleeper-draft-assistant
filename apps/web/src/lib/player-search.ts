import type { DraftState, Player, Position, Team } from "@sleeper-draft-assistant/shared";
import type { PlayerPreferenceLevel, PlayerPreferences } from "./types";

export type PlayerSearchResult = {
  player: Player;
  preference: PlayerPreferenceLevel | null;
  draftedBy: Team | null;
};

const preferenceOrder: Record<PlayerPreferenceLevel, number> = {
  pin: 0,
  fade: 1,
  exclude: 2,
};

export function searchDraftPlayers(
  state: DraftState,
  query: string,
  position: Position | null,
  preferences: PlayerPreferences,
  limit = 40,
): PlayerSearchResult[] {
  const normalizedQuery = normalize(query);
  const draftedTeamByPlayer = new Map(
    state.picks.map((pick) => [pick.playerId, state.teams.find((team) => team.id === pick.teamId) ?? null]),
  );

  return state.players
    .flatMap((player) => {
      if (position && player.position !== position) {
        return [];
      }
      const preference = preferences[player.id] ?? null;
      if (!normalizedQuery && !preference) {
        return [];
      }
      const matchScore = normalizedQuery ? playerMatchScore(player, normalizedQuery) : 0;
      if (matchScore === null) {
        return [];
      }
      return [{
        player,
        preference,
        draftedBy: draftedTeamByPlayer.get(player.id) ?? null,
        matchScore,
      }];
    })
    .sort((a, b) => {
      if (!normalizedQuery && a.preference && b.preference) {
        const preferenceDifference = preferenceOrder[a.preference] - preferenceOrder[b.preference];
        if (preferenceDifference !== 0) {
          return preferenceDifference;
        }
      }
      return a.matchScore - b.matchScore
        || Number(Boolean(a.draftedBy)) - Number(Boolean(b.draftedBy))
        || playerValueOrder(a.player) - playerValueOrder(b.player)
        || a.player.name.localeCompare(b.player.name);
    })
    .slice(0, limit)
    .map(({ matchScore: _matchScore, ...result }) => result);
}

function playerMatchScore(player: Player, query: string): number | null {
  const name = normalize(player.name);
  const team = normalize(player.team);
  const position = normalize(player.position);
  if (name === query) return 0;
  if (name.startsWith(query)) return 5;
  if (name.split(" ").some((part) => part.startsWith(query))) return 10;
  if (name.includes(query)) return 15;
  if (team === query || position === query) return 20;
  const subsequenceScore = subsequenceDistance(name, query);
  return subsequenceScore === null ? null : 30 + subsequenceScore;
}

function subsequenceDistance(value: string, query: string): number | null {
  let queryIndex = 0;
  let gaps = 0;
  for (let index = 0; index < value.length && queryIndex < query.length; index += 1) {
    if (value[index] === query[queryIndex]) {
      queryIndex += 1;
    } else if (queryIndex > 0) {
      gaps += 1;
    }
  }
  return queryIndex === query.length ? gaps : null;
}

function playerValueOrder(player: Player): number {
  return player.importedRank
    ?? player.realTimeAdp
    ?? player.adp
    ?? 10_000;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
