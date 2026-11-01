import { buildTeamDataReadiness } from "@sleeper-draft-assistant/engine";
import type { Page } from "@playwright/test";
import type { Player, Position, TeamPayload } from "../../apps/web/src/lib/types";

// A synthetic 16-player league. Every name, team and number here is invented for layout and behavior checks.
const STARTERS: Array<[string, Position, string, string, string, number]> = [
  ["QB", "QB", "Marlon Ashby", "SEA", "SF", 21.4],
  ["RB", "RB", "Jonah Whitfield", "ATL", "TB", 19.2],
  ["RB", "RB", "Devin Okafor", "MIA", "BAL", 16.8],
  ["WR", "WR", "Tavon Reyes-Bright", "DET", "GB", 17.1],
  ["WR", "WR", "Garrett Lindqvist", "NYJ", "CIN", 14.6],
  ["TE", "TE", "Sam Delacroix", "DET", "GB", 10.4],
  ["FLEX", "WR", "Miles Everhart", "TB", "ATL", 13.2],
  ["K", "K", "Jake Moreno", "PHI", "DAL", 8.1],
  ["DEF", "DEF", "Baltimore Defense", "BAL", "MIA", 7.6],
];

const BENCH: Array<[Position, string, string, string, number]> = [
  ["QB", "Owen Castellano", "LV", "KC", 15.2],
  ["RB", "Trey Abernathy", "CAR", "NO", 9.7],
  ["RB", "Kyle Nakamura", "LAR", "ARI", 8.4],
  ["WR", "Dante Holloway", "CLE", "PIT", 10.1],
  ["WR", "Ezra Quinn", "HOU", "IND", 7.9],
  ["TE", "Cole Vandermeer", "NE", "BUF", 5.5],
];

const status = (overrides: Partial<NonNullable<Player["sleeperStatus"]>> = {}): NonNullable<Player["sleeperStatus"]> => ({
  rosterStatus: "Active", injuryStatus: null, injuryStartDate: null, practiceParticipation: null,
  depthChartPosition: null, depthChartOrder: null, newsUpdatedAt: null, ...overrides,
});

function rosterPlayer(position: Position, name: string, team: string, opponent: string, points: number | null, index: number): Player {
  return {
    id: `synthetic-${name}`, sleeperId: `synthetic-${name}`, name, team, position,
    projectedPoints: points ?? 0, projectionSource: points === null ? "sleeper_search_rank" : "weekly_projection",
    adp: null, tier: null, riskTags: [], sleeperStatus: status(),
    weeklyProjectedPoints: points, weeklyProjectionSeason: "2026", weeklyProjectionWeek: 8,
    schedule: { season: "2026", week: 8, source: "sleeper", onBye: false, opponent, homeAway: index % 2 ? "away" : "home", gameStatus: "pre_game" },
  } as Player;
}

export type LineupScenario = "all-clear" | "needs-look" | "preseason" | "unknown-week";

export function lineupPayload(payload: TeamPayload, scenario: LineupScenario, activity = false): TeamPayload {
  const starters = STARTERS.map(([slot, position, name, team, opponent, points], index) => ({
    slot, eligiblePositions: slot === "FLEX" ? ["RB", "WR", "TE"] : [position],
    player: rosterPlayer(position, name, team, opponent, points, index),
  }));
  const bench = BENCH.map(([position, name, team, opponent, points], index) => rosterPlayer(position, name, team, opponent, points, index));
  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"] as Position[];
  const appliedAt = new Date().toISOString();
  let weeklyProjectionSummary: TeamPayload["weeklyProjectionSummary"] = {
    source: "fantasypros", season: "2026", week: 8, position: "QB", positions,
    positionResults: positions.map((position) => ({ position, matched: 30, rowsParsed: 30, unmatched: 0, ambiguous: 0, appliedAt })),
    matched: 180, rowsParsed: 180, unmatched: [], ambiguous: [], appliedAt,
  };

  if (scenario === "needs-look") {
    const [qb, , secondRb, firstWr, secondWr, , flex] = starters;
    qb!.player!.schedule = { season: "2026", week: 8, source: "sleeper", onBye: true, opponent: null, homeAway: null, gameStatus: null };
    qb!.player!.weeklyProjectedPoints = null;
    secondRb!.player!.sleeperStatus = status({ injuryStatus: "Questionable", practiceParticipation: "Limited participation", depthChartPosition: "RB", depthChartOrder: 1 });
    for (const slot of [firstWr, secondWr, flex]) {
      slot!.player!.weeklyProjectedPoints = null;
      slot!.player!.projectionSource = "sleeper_search_rank";
    }
    bench[1]!.sleeperStatus = status({ injuryStatus: "Out" });
    const withoutWr = positions.filter((position) => position !== "WR");
    weeklyProjectionSummary = { ...weeklyProjectionSummary, positions: withoutWr, positionResults: weeklyProjectionSummary.positionResults.filter(({ position }) => position !== "WR") };
  }

  const transaction = (id: string, description: string) => ({
    id, type: "waiver", status: "complete", createdAt: null, rosterIds: ["2"], addedPlayers: [], droppedPlayers: [], waiverBid: null, description,
  });

  const state = {
    ...payload.state,
    seasonPhase: scenario === "preseason" ? "preseason" : scenario === "unknown-week" ? "unknown" : "regular",
    week: scenario === "needs-look" || scenario === "all-clear" ? 8 : null,
    scheduleStatus: { available: true, week: scenario === "needs-look" || scenario === "all-clear" ? 8 : null },
    league: { ...payload.state.league, name: "Gridiron Gang" },
    userTeam: { ...payload.state.userTeam, name: "Synthetic Sluggers" },
    roster: { ...payload.state.roster, starters, bench, injuredReserve: [rosterPlayer("WR", "Ian Prescott", "DAL", "NYG", null, 0)], taxi: [] },
  } as TeamPayload["state"];

  return {
    ...payload,
    state,
    dataReadiness: buildTeamDataReadiness(state, weeklyProjectionSummary),
    weekContext: scenario === "needs-look" || scenario === "all-clear" ? { ...(payload.weekContext ?? {}), week: 8, opponentTeamName: "Other Team" } as TeamPayload["weekContext"] : null,
    weeklyProjectionSummary,
    activitySummary: activity ? {
      ...payload.activitySummary,
      headline: "2 recent league transactions loaded.",
      recentTransactions: [transaction("t1", "Team 4 added Jace Mingo"), transaction("t2", "Team 7 traded for Dale Henning")],
    } : { ...payload.activitySummary, recentTransactions: [], trendingAdds: [], trendingDrops: [] },
  };
}

export async function routeLineup(page: Page, scenario: LineupScenario, activity = false) {
  await page.route(/\/api\/leagues\/[^/]+\/team(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: lineupPayload(await response.json() as TeamPayload, scenario, activity) });
  });
}

// Applies a change to the lineup payload and recomputes readiness with the real engine, so the drawer sees a coherent payload.
export function dataPayload(payload: TeamPayload, scenario: LineupScenario, change: (draft: TeamPayload) => void = () => undefined): TeamPayload {
  const draft = lineupPayload(payload, scenario);
  change(draft);
  return { ...draft, dataReadiness: buildTeamDataReadiness(draft.state, draft.weeklyProjectionSummary) };
}

export async function routeData(page: Page, scenario: LineupScenario, change?: (draft: TeamPayload, url: URL) => void) {
  await page.route(/\/api\/leagues\/[^/]+\/team(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const url = new URL(route.request().url());
    await route.fulfill({ response, json: dataPayload(await response.json() as TeamPayload, scenario, (draft) => change?.(draft, url)) });
  });
}
