import { nflTeams, type NflSchedule } from "../nfl-schedule";

// Synthetic pairings, including Thursday and Sunday international-style dates.
export const syntheticSchedule: NflSchedule = Array.from({ length: 18 }, (_, i) => i + 1)
  .filter((week) => week !== 9)
  .flatMap((week) => Array.from({ length: 16 }, (_, pair) => ({
    status: "pre_game" as const,
    date: pair % 2 ? "2026-10-18" : "2026-10-15",
    home: nflTeams[pair * 2]!, away: nflTeams[pair * 2 + 1]!,
    week, game_id: `synthetic-${week}-${pair}`,
  })));
