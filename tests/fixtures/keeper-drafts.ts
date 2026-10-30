import type { SleeperDraftStateInput } from "../../apps/api/src/sleeper";

const through = (last: number) => Array.from({ length: last }, (_, index) => index + 1);

// Twelve teams, three snake rounds. Slot 3 owns 3, 22, 27.
export const keeperCases = [
  { name: "two round-one keepers", made: [], keepers: [5, 8], current: 1, next: 3, following: 22, away: 2, between: 16, remaining: 3, marketAway: 2 },
  { name: "later-round keepers", made: [], keepers: [14, 26], current: 1, next: 3, following: 22, away: 2, between: 17, remaining: 3, marketAway: 2 },
  { name: "arrives at one keeper", made: [1, 2], keepers: [3], current: 4, next: 22, following: 27, away: 18, between: 4, remaining: 2, marketAway: 18 },
  { name: "arrives at consecutive keepers", made: [1, 2], keepers: [3, 4, 5], current: 6, next: 22, following: 27, away: 16, between: 4, remaining: 2, marketAway: 16 },
  { name: "own pick is a keeper", made: [], keepers: [3], current: 1, next: 22, following: 27, away: 20, between: 4, remaining: 2, marketAway: 20 },
  { name: "keepers plus traded pick", made: [], keepers: [2, 5], trade: true, current: 1, next: 1, following: 3, away: 0, between: 0, remaining: 4, marketAway: 1 },
  { name: "only remaining pick follows keepers", made: through(32), keepers: [33, 34, 35], userSlot: 12, current: 36, next: 36, following: null, away: 0, between: null, remaining: 1, marketAway: null },
  { name: "completed", made: through(34), keepers: [35, 36], current: 36, next: null, following: null, away: null, between: null, remaining: 0, marketAway: null },
  { name: "no keepers", made: [1, 2], keepers: [], current: 3, next: 3, following: 22, away: 0, between: 18, remaining: 3, marketAway: 19 },
];

export function keeperInput(test: typeof keeperCases[number]): SleeperDraftStateInput {
  const picks = [...test.made, ...test.keepers].map((pickNo) => {
    const round = Math.ceil(pickNo / 12);
    const inRound = (pickNo - 1) % 12 + 1;
    const slot = round % 2 === 1 ? inRound : 13 - inRound;
    return { pick_no: pickNo, round, draft_slot: slot, roster_id: slot, player_id: `p${pickNo}`, is_keeper: test.keepers.includes(pickNo) };
  });
  return {
    draft: {
      draft_id: "synthetic-keepers", type: "snake", season: "2026", status: "drafting",
      settings: { teams: 12, rounds: 3, slots_bn: 3 },
      slot_to_roster_id: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), i + 1])),
    },
    picks: picks.reverse(),
    players: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`p${i + 1}`, {
      player_id: `p${i + 1}`, full_name: `Synthetic Player ${i + 1}`, position: "WR", team: "BUF", sport: "nfl", search_rank: i + 1,
    }])),
    userRosterId: String(test.userSlot ?? 3),
    tradedPicks: test.trade ? [{ season: "2026", round: 1, roster_id: 1, previous_owner_id: 1, owner_id: 3 }] : [],
  };
}
