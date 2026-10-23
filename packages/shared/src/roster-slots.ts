import type { Position } from "./index";

type PositionCounts = Record<Position, number>;

// Sleeper roster_positions starter slots and the positions each accepts.
// WRRB_FLEX is RB/WR and REC_FLEX is WR/TE; SF is a legacy superflex alias.
export const STARTER_SLOT_POSITIONS: Readonly<Record<string, readonly Position[]>> = Object.freeze({
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  SF: ["QB", "RB", "WR", "TE"],
});

export const REGULAR_FLEX_SLOTS = ["FLEX", "WRRB_FLEX", "REC_FLEX"] as const;
export const SUPER_FLEX_SLOTS = ["SUPER_FLEX", "SF"] as const;

/** Regular (non-superflex) flex slots, optionally only those accepting `position`. */
export function countRegularFlexSlots(rosterSlots: Record<string, number>, position?: Position): number {
  return REGULAR_FLEX_SLOTS
    .filter((slot) => !position || STARTER_SLOT_POSITIONS[slot]!.includes(position))
    .reduce((total, slot) => total + Math.max(0, rosterSlots[slot] ?? 0), 0);
}

export function countSuperFlexSlots(rosterSlots: Record<string, number>): number {
  return SUPER_FLEX_SLOTS.reduce((total, slot) => total + Math.max(0, rosterSlots[slot] ?? 0), 0);
}

export function withoutSuperFlexSlots(rosterSlots: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(rosterSlots).filter(([slot]) => !(SUPER_FLEX_SLOTS as readonly string[]).includes(slot)));
}

/**
 * Starter slots left empty by the best assignment of rostered players. Each
 * single-position slot takes its own position first, which is always optimal;
 * the remaining players are then matched to flex slots.
 */
export function countUnfilledStarterSlots(rosterSlots: Record<string, number>, counts: PositionCounts): number {
  const spare: PositionCounts = { ...counts };
  const flexSlots: Array<readonly Position[]> = [];
  let unfilled = 0;
  for (const [slot, rawCount] of Object.entries(rosterSlots)) {
    const eligible = STARTER_SLOT_POSITIONS[slot];
    const count = Math.max(0, rawCount);
    if (!eligible || count === 0) continue;
    if (eligible.length > 1) {
      for (let index = 0; index < count; index += 1) flexSlots.push(eligible);
      continue;
    }
    const position = eligible[0]!;
    const filled = Math.min(count, spare[position]);
    spare[position] -= filled;
    unfilled += count - filled;
  }

  const players = (Object.keys(spare) as Position[]).flatMap((position) => Array<Position>(spare[position]).fill(position));
  const slotPlayer = new Array<number>(flexSlots.length).fill(-1);
  const place = (player: number, visited: boolean[]): boolean => {
    for (let slot = 0; slot < flexSlots.length; slot += 1) {
      if (visited[slot] || !flexSlots[slot]!.includes(players[player]!)) continue;
      visited[slot] = true;
      if (slotPlayer[slot] === -1 || place(slotPlayer[slot]!, visited)) {
        slotPlayer[slot] = player;
        return true;
      }
    }
    return false;
  };
  let filledFlex = 0;
  for (let player = 0; player < players.length && filledFlex < flexSlots.length; player += 1) {
    if (place(player, new Array<boolean>(flexSlots.length).fill(false))) filledFlex += 1;
  }
  return unfilled + flexSlots.length - filledFlex;
}
