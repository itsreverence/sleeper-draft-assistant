import { z } from "zod";

import { getAvailablePlayers } from "@sleeper-draft-assistant/engine";
import type { DraftState, Player, Position } from "@sleeper-draft-assistant/shared";

import type { AiTool, DraftPlayerEvidence, PlayerPreferenceSummary } from "./types";

const positions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const sortOptions = ["ecr", "projection", "sleeper_adp", "realtime_adp"] as const;

const SearchPlayersInputSchema = z.object({
  positions: z.array(z.enum(positions as [Position, ...Position[]])).max(6).optional(),
  sortBy: z.enum(sortOptions).default("ecr"),
  limit: z.number().int().min(1).max(20).default(10),
  tier: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export type DraftPlayerSnapshot = {
  basedOnPick: number;
  players: Player[];
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
          "Search the immutable pool of players available at the current pick. Use this whenever the initial player pool does not cover a position, tier, or player you want to investigate. Results contain raw imported evidence, not a recommendation score.",
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
  ];
}

export function buildNeutralInitialPlayerPool(
  snapshot: DraftPlayerSnapshot,
  openDirectStarterSlots: Record<Position, number>,
): DraftPlayerEvidence[] {
  const eligible = snapshot.players.filter((player) => !snapshot.preferences.excluded.has(player.id));
  const selected = new Map<string, Player>();
  const addTop = (players: Player[], count: number, sortBy: typeof sortOptions[number]) => {
    for (const player of [...players].sort((left, right) => comparePlayers(left, right, sortBy)).slice(0, count)) {
      selected.set(player.id, player);
    }
  };

  addTop(eligible, 10, "ecr");
  addTop(eligible, 8, "projection");
  addTop(eligible, 8, "sleeper_adp");
  for (const position of positions) {
    if (openDirectStarterSlots[position] > 0 || position === "RB" || position === "WR") {
      addTop(eligible.filter((player) => player.position === position), 2, "ecr");
    }
  }
  for (const player of eligible.filter((candidate) => snapshot.preferences.pinned.has(candidate.id))) {
    selected.set(player.id, player);
  }

  return [...selected.values()]
    .slice(0, 36)
    .map((player) => toDraftPlayerEvidence(player, snapshot));
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
    sleeperAdp: player.adpSource ? player.adp : null,
    realTimeAdp: player.realTimeAdp ?? null,
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
  return player.realTimeAdp ?? null;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
