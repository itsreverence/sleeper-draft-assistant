import { z } from "zod";
import type { Player, TeamManagerState } from "@sleeper-draft-assistant/shared";

export const nflTeams = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"] as const;
const GameSchema = z.object({
  status: z.enum(["pre_game", "in_progress", "complete", "postponed", "canceled"]),
  date: z.iso.date(),
  home: z.enum(nflTeams),
  away: z.enum(nflTeams),
  week: z.number().int().min(1).max(18),
  game_id: z.string().min(1).max(40),
}).strict();
export const NflScheduleSchema = z.array(GameSchema).length(272).superRefine((games, ctx) => {
  const ids = new Set<string>();
  const teamWeeks = new Set<string>();
  const counts = new Map<string, number>();
  for (const game of games) {
    if (ids.has(game.game_id) || game.home === game.away) ctx.addIssue({ code: "custom", message: "Invalid game identity" });
    ids.add(game.game_id);
    for (const team of [game.home, game.away]) {
      const key = `${team}:${game.week}`;
      if (teamWeeks.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate team week" });
      teamWeeks.add(key);
      counts.set(team, (counts.get(team) ?? 0) + 1);
    }
  }
  if (nflTeams.some((team) => counts.get(team) !== 17)) ctx.addIssue({ code: "custom", message: "Incomplete season" });
});
export type NflSchedule = z.infer<typeof NflScheduleSchema>;

export function applyPlayerSchedule(player: Player, schedule: NflSchedule | null, season: string | null, week: number | null): Player {
  const validWeek = week !== null && Number.isInteger(week) && week >= 1 && week <= 18;
  const games = schedule?.filter((game) => game.home === player.team || game.away === player.team);
  const knownTeam = games?.length === 17;
  const importedBye = player.byeWeek && Number.isInteger(player.byeWeek) && player.byeWeek >= 1 && player.byeWeek <= 18 ? player.byeWeek : null;
  const byeWeek = knownTeam ? Array.from({ length: 18 }, (_, i) => i + 1).find((candidate) => !games.some((game) => game.week === candidate)) ?? null : importedBye;
  const game = knownTeam && validWeek ? games.find((candidate) => candidate.week === week) : null;
  const onBye = validWeek && byeWeek !== null ? byeWeek === week : null;
  return { ...player, byeWeek, schedule: {
    season, week, source: knownTeam ? "sleeper" : byeWeek !== null ? "draft_import" : "unknown",
    onBye, opponent: game ? game.home === player.team ? game.away : game.home : null,
    homeAway: game ? game.home === player.team ? "home" : "away" : null,
    gameStatus: game?.status ?? null,
  } };
}

export function applyTeamSchedule(state: TeamManagerState, apply: (player: Player) => Player, available: boolean, week: number | null): TeamManagerState {
  return { ...state, scheduleStatus: { available, week }, roster: { ...state.roster,
    starters: state.roster.starters.map((slot) => ({ ...slot, player: slot.player ? apply(slot.player) : null })),
    bench: state.roster.bench.map(apply), injuredReserve: state.roster.injuredReserve.map(apply), taxi: state.roster.taxi.map(apply),
  } };
}
