import { z } from "zod";

import { getAvailablePlayers } from "@sleeper-draft-assistant/engine";
import type { DraftState, Player, Position } from "@sleeper-draft-assistant/shared";

import type { AiTool, DraftPlayerEvidence, DraftPlayerEvidenceGroups, PlayerPreferenceSummary } from "./types";

const positions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const sortOptions = ["ecr", "projection", "sleeper_adp", "realtime_adp", "sleeper_search_rank"] as const;

const SearchPlayersInputSchema = z.object({
  positions: z.array(z.enum(positions as [Position, ...Position[]])).max(6).optional(),
  sortBy: z.enum(sortOptions).default("ecr"),
  limit: z.number().int().min(1).max(20).default(10),
  tier: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80).optional(),
});
const ComparePlayersInputSchema = z.object({
  playerIds: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
});
const PositionMarketInputSchema = z.object({
  positions: z.array(z.enum(positions as [Position, ...Position[]])).min(1).max(3),
  tierLimit: z.number().int().min(1).max(6).default(4),
});

export type DraftPlayerSnapshot = {
  basedOnPick: number;
  players: Player[];
  allPlayers: Player[];
  state: Pick<DraftState, "currentPick" | "settings" | "teams" | "picks" | "pickOrder" | "userTeamId">;
  draftedPlayerIds: Set<string>;
  preferences: {
    pinned: Set<string>;
    faded: Set<string>;
    excluded: Set<string>;
  };
};

export function createDraftPlayerSnapshot(
  state: DraftState,
  preferences: PlayerPreferenceSummary,
): DraftPlayerSnapshot {
  const resolvePreferences = (values: string[]) => {
    const normalized = new Set(values.map(normalizeSearchText));
    return new Set(
      state.players
        .filter((player) => normalized.has(normalizeSearchText(player.id)) || normalized.has(normalizeSearchText(player.name)))
        .map((player) => player.id),
    );
  };
  return {
    basedOnPick: state.currentPick,
    players: getAvailablePlayers(state).map((player) => structuredClone(player)),
    allPlayers: state.players.map((player) => structuredClone(player)),
    state: {
      currentPick: state.currentPick,
      settings: structuredClone(state.settings),
      teams: structuredClone(state.teams),
      picks: structuredClone(state.picks),
      pickOrder: structuredClone(state.pickOrder),
      userTeamId: state.userTeamId,
    },
    draftedPlayerIds: new Set(state.picks.map((pick) => pick.playerId)),
    preferences: {
      pinned: resolvePreferences(preferences.pinned),
      faded: resolvePreferences(preferences.faded),
      excluded: resolvePreferences(preferences.excluded),
    },
  };
}

export function createDraftStrategyTools(snapshot: DraftPlayerSnapshot): AiTool[] {
  return [
    {
      definition: {
        type: "function",
        name: "search_available_players",
        description:
          "Search players available in the immutable current-pick snapshot when the supplied evidence groups do not cover a material position, tier, or named alternative. Returns the captured pick number, raw sort field, total matches, and player evidence without recommendation scores.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            positions: {
              type: "array",
              maxItems: 6,
              items: { type: "string", enum: positions },
              description: "Optional positions to include.",
            },
            sortBy: {
              type: "string",
              enum: sortOptions,
              default: "ecr",
              description: "Raw evidence field used to order results.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 20,
              default: 10,
            },
            tier: {
              type: "integer",
              minimum: 1,
              description: "Optional exact imported tier.",
            },
            name: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Optional case-insensitive player-name search.",
            },
          },
        },
      },
      async execute(argumentsValue) {
        const input = SearchPlayersInputSchema.parse(argumentsValue);
        let players = snapshot.players.filter((player) => !snapshot.preferences.excluded.has(player.id));
        if (input.positions?.length) {
          const allowed = new Set(input.positions);
          players = players.filter((player) => allowed.has(player.position));
        }
        if (input.tier !== undefined) {
          players = players.filter((player) => player.tier === input.tier);
        }
        if (input.name) {
          const query = normalizeSearchText(input.name);
          players = players.filter((player) => normalizeSearchText(player.name).includes(query));
        }

        players.sort((left, right) => comparePlayers(left, right, input.sortBy));
        const selected = players.slice(0, input.limit);
        return {
          basedOnPick: snapshot.basedOnPick,
          sortBy: input.sortBy,
          totalMatches: players.length,
          players: selected.map((player) => toDraftPlayerEvidence(player, snapshot)),
        };
      },
    },
    {
      definition: {
        type: "function",
        name: "compare_players",
        description:
          "Compare two to six named player IDs using raw evidence from the immutable current-pick snapshot. Use this when the user names players or when the decision is between specific alternatives. It reports availability and does not assign a recommendation.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            playerIds: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: { type: "string", minLength: 1 },
              description: "Player IDs from the supplied evidence or a prior search result.",
            },
          },
          required: ["playerIds"],
        },
      },
      async execute(argumentsValue) {
        const input = ComparePlayersInputSchema.parse(argumentsValue);
        const playersById = new Map(snapshot.allPlayers.map((player) => [player.id, player]));
        const selectedIds = [...new Set(input.playerIds)];
        return {
          basedOnPick: snapshot.basedOnPick,
          players: selectedIds.flatMap((playerId) => {
            const player = playersById.get(playerId);
            if (!player) return [];
            const availability = snapshot.preferences.excluded.has(player.id)
              ? "excluded"
              : snapshot.draftedPlayerIds.has(player.id)
                ? "drafted"
                : "available";
            return [{
              ...toDraftPlayerEvidence(player, snapshot),
              availability,
            }];
          }),
          missingPlayerIds: selectedIds.filter((playerId) => !playersById.has(playerId)),
        };
      },
    },
    {
      definition: {
        type: "function",
        name: "inspect_position_market",
        description:
          "Inspect objective positional supply in the immutable current-pick snapshot. Use this before making a strong wait-or-take claim when tier depth, a positional run, or the teams selecting before the next user turn matters. It reports supply and roster facts, not a recommendation, and labels whether pick timing comes from Sleeper order data, a normal-snake fallback, or an unsupported format.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            positions: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: { type: "string", enum: positions },
              description: "One to three positions to inspect.",
            },
            tierLimit: {
              type: "integer",
              minimum: 1,
              maximum: 6,
              default: 4,
              description: "Number of imported tiers to include for each position.",
            },
          },
          required: ["positions"],
        },
      },
      async execute(argumentsValue) {
        const input = PositionMarketInputSchema.parse(argumentsValue);
        const userNextPick = findNextUserPick(snapshot.state);
        const teamsBeforeNextTurn = getTeamsBeforeNextTurn(snapshot.state, userNextPick, snapshot.allPlayers);
        const playersByPosition = new Map(
          input.positions.map((position) => [
            position,
            snapshot.players
              .filter((player) => player.position === position && !snapshot.preferences.excluded.has(player.id))
              .sort((left, right) => comparePlayers(left, right, "ecr")),
          ]),
        );

        return {
          basedOnPick: snapshot.basedOnPick,
          pickOrderSource: getPickOrderSource(snapshot.state),
          pickOrderNote: getPickOrderNote(snapshot.state),
          userNextPick,
          picksUntilNextUserTurn: userNextPick === null ? null : userNextPick - snapshot.basedOnPick,
          teamsSelectingBeforeNextTurn: teamsBeforeNextTurn,
          markets: input.positions.map((position) => {
            const players = playersByPosition.get(position) ?? [];
            const tierGroups = groupByTier(players);
            return {
              position,
              availableCount: players.length,
              draftedCount: snapshot.allPlayers.filter((player) =>
                player.position === position && snapshot.draftedPlayerIds.has(player.id),
              ).length,
              tiers: tierGroups.slice(0, input.tierLimit).map(({ tier, players: tierPlayers }) => ({
                tier,
                availableCount: tierPlayers.length,
                players: tierPlayers.slice(0, 3).map((player) => toDraftPlayerEvidence(player, snapshot)),
              })),
            };
          }),
        };
      },
    },
  ];
}

export function buildGroupedPlayerEvidence(
  snapshot: DraftPlayerSnapshot,
  openDirectStarterSlots: Record<Position, number>,
): {
  playerEvidence: DraftPlayerEvidence[];
  playerEvidenceGroups: DraftPlayerEvidenceGroups;
} {
  const eligible = snapshot.players.filter((player) => !snapshot.preferences.excluded.has(player.id));
  const selectTopIds = (players: Player[], count: number, sortBy: typeof sortOptions[number]) =>
    [...players]
      .filter((player) => getSortValue(player, sortBy) !== null)
      .sort((left, right) => comparePlayers(left, right, sortBy))
      .slice(0, count)
      .map((player) => player.id);
  const groups: DraftPlayerEvidenceGroups = {
    pinnedTargets: eligible
      .filter((player) => snapshot.preferences.pinned.has(player.id))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((player) => player.id),
    ecrLeaders: selectTopIds(eligible, 10, "ecr"),
    projectionLeaders: selectTopIds(eligible, 8, "projection"),
    sleeperAdpLeaders: selectTopIds(eligible, 8, "sleeper_adp"),
    realTimeAdpLeaders: selectTopIds(eligible, 8, "realtime_adp"),
    sleeperSearchRankLeaders: selectTopIds(eligible, 10, "sleeper_search_rank"),
    positionCoverage: {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      K: [],
      DEF: [],
    },
  };
  for (const position of positions) {
    if (openDirectStarterSlots[position] > 0 || position === "RB" || position === "WR") {
      const positionPlayers = eligible.filter((player) => player.position === position);
      for (const sortBy of ["ecr", "projection", "sleeper_adp", "sleeper_search_rank"] as const) {
        const candidates = selectTopIds(positionPlayers, 2, sortBy);
        if (candidates.length > 0) {
          groups.positionCoverage[position] = candidates;
          break;
        }
      }
    }
  }
  const selectedIds = new Set([
    ...groups.pinnedTargets,
    ...groups.ecrLeaders,
    ...groups.projectionLeaders,
    ...groups.sleeperAdpLeaders,
    ...groups.realTimeAdpLeaders,
    ...groups.sleeperSearchRankLeaders,
    ...Object.values(groups.positionCoverage).flat(),
  ]);
  const playerEvidence = eligible
    .filter((player) => selectedIds.has(player.id))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((player) => toDraftPlayerEvidence(player, snapshot));

  return {
    playerEvidence,
    playerEvidenceGroups: groups,
  };
}

export function toDraftPlayerEvidence(
  player: Player,
  snapshot: DraftPlayerSnapshot,
): DraftPlayerEvidence {
  return {
    playerId: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    source: player.projectionSource,
    importedRank: player.importedRank ?? null,
    importedPositionRank: player.importedPositionRank ?? null,
    seasonProjectedPoints: player.seasonProjectedPoints ?? (
      player.projectionSource === "season_projection" ? player.projectedPoints : null
    ),
    sleeperSearchRank: player.projectionSource === "sleeper_search_rank" ? player.projectedPoints : null,
    sleeperAdp: player.adpSource ? player.adp : null,
    realTimeAdp: player.realTimeAdp ?? null,
    ecrVsAdp: player.ecrVsAdp ?? null,
    tier: player.tier ?? null,
    byeWeek: player.byeWeek ?? null,
    riskTags: player.riskTags,
    preference: snapshot.preferences.pinned.has(player.id)
      ? "pinned"
      : snapshot.preferences.faded.has(player.id)
        ? "faded"
        : null,
  };
}

function comparePlayers(
  left: Player,
  right: Player,
  sortBy: typeof sortOptions[number],
): number {
  const leftValue = getSortValue(left, sortBy);
  const rightValue = getSortValue(right, sortBy);
  if (leftValue === null && rightValue === null) {
    return left.name.localeCompare(right.name);
  }
  if (leftValue === null) {
    return 1;
  }
  if (rightValue === null) {
    return -1;
  }
  return sortBy === "projection"
    ? rightValue - leftValue || left.name.localeCompare(right.name)
    : leftValue - rightValue || left.name.localeCompare(right.name);
}

function getSortValue(player: Player, sortBy: typeof sortOptions[number]): number | null {
  if (sortBy === "ecr") {
    return player.importedRank ?? null;
  }
  if (sortBy === "projection") {
    return player.seasonProjectedPoints ?? (
      player.projectionSource === "season_projection" || player.projectionSource === "mock"
        ? player.projectedPoints
        : null
    );
  }
  if (sortBy === "sleeper_adp") {
    return player.adpSource ? player.adp : null;
  }
  if (sortBy === "realtime_adp") {
    return player.realTimeAdp ?? null;
  }
  return player.projectionSource === "sleeper_search_rank" ? player.projectedPoints : null;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function groupByTier(players: Player[]): Array<{ tier: number | null; players: Player[] }> {
  const groups = new Map<number | null, Player[]>();
  for (const player of players) {
    const tier = player.tier ?? null;
    const existing = groups.get(tier) ?? [];
    existing.push(player);
    groups.set(tier, existing);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    })
    .map(([tier, tierPlayers]) => ({ tier, players: tierPlayers }));
}

function findNextUserPick(state: DraftPlayerSnapshot["state"]): number | null {
  const userSlot = state.teams.find((team) => team.id === state.userTeamId)?.draftSlot;
  if (!userSlot) return null;
  if (state.pickOrder?.source === "unsupported") return null;
  const currentSlot = draftSlotForPick(state.currentPick, state.settings.teams);
  const start = currentSlot === userSlot ? state.currentPick + 1 : state.currentPick;
  const totalPicks = state.settings.teams * state.settings.rounds;
  if (state.pickOrder?.entries.length) {
    return state.pickOrder.entries.find((entry) => entry.pickNo >= start && entry.teamId === state.userTeamId)?.pickNo ?? null;
  }
  for (let pickNo = start; pickNo <= totalPicks; pickNo += 1) {
    if (draftSlotForPick(pickNo, state.settings.teams) === userSlot) return pickNo;
  }
  return null;
}

function getTeamsBeforeNextTurn(
  state: DraftPlayerSnapshot["state"],
  nextUserPick: number | null,
  players: Player[],
): Array<{ team: string; draftSlot: number; positionCounts: Record<Position, number> }> {
  if (nextUserPick === null || state.pickOrder?.source === "unsupported") return [];
  const teamsBySlot = new Map(state.teams.map((team) => [team.draftSlot, team]));
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  const pickOrderByNumber = new Map((state.pickOrder?.entries ?? []).map((entry) => [entry.pickNo, entry]));
  const playersById = new Map(players.map((player) => [player.id, player]));
  const selected = new Map<string, { team: string; draftSlot: number; positionCounts: Record<Position, number> }>();
  for (let pickNo = state.currentPick; pickNo < nextUserPick; pickNo += 1) {
    const orderEntry = pickOrderByNumber.get(pickNo);
    const team = orderEntry
      ? teamsById.get(orderEntry.teamId)
      : teamsBySlot.get(draftSlotForPick(pickNo, state.settings.teams));
    if (!team || team.id === state.userTeamId || selected.has(team.id)) continue;
    selected.set(team.id, {
      team: team.name,
      draftSlot: team.draftSlot,
      positionCounts: countRosterPositions(team.roster, playersById),
    });
  }
  return [...selected.values()];
}

function getPickOrderSource(state: DraftPlayerSnapshot["state"]): "sleeper" | "normal_snake_fallback" | "unsupported" {
  return state.pickOrder?.source ?? "normal_snake_fallback";
}

function getPickOrderNote(state: DraftPlayerSnapshot["state"]): string | null {
  const source = getPickOrderSource(state);
  if (source === "sleeper") return null;
  if (source === "unsupported") return "This draft format does not expose a modeled pick-by-pick turn order.";
  return "Sleeper pick-order data is unavailable in this snapshot; timing uses normal snake slot order.";
}

function countRosterPositions(roster: string[], playersById: Map<string, Player>): Record<Position, number> {
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const playerId of roster) {
    const position = playersById.get(playerId)?.position;
    if (position) counts[position] += 1;
  }
  return counts;
}

function draftSlotForPick(pickNo: number, teams: number): number {
  const round = Math.ceil(pickNo / teams);
  const pickInRound = ((pickNo - 1) % teams) + 1;
  return round % 2 === 1 ? pickInRound : teams + 1 - pickInRound;
}
