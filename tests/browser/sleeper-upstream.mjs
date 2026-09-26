// Only the test-owned API process loads this upstream fixture. Application
// normalization, authorization, parsers, routes and SQLite remain real.
if (process.env.SDA_BROWSER_TEST !== "1") throw new Error("Browser fixture requires isolated runner");

const player = { player_id: "fixture-qb", full_name: "Test Quarterback", first_name: "Test", last_name: "Quarterback", team: "BUF", position: "QB", fantasy_positions: ["QB"], active: true, status: "Active" };
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input);
  if (url.origin !== "https://api.sleeper.app") throw new Error("Unexpected external request in browser fixture");
  const path = url.pathname.replace(/^\/v1/, "");
  let data;
  if (path === "/state/nfl") data = { season: "2026", league_season: "2026", season_type: "regular", week: 2, display_week: 2 };
  else if (path === "/players/nfl") data = { "fixture-qb": player };
  else if (/^\/players\/nfl\/trending\//.test(path)) data = [];
  else if (/^\/draft\/browser-[\w-]+$/.test(path)) {
    const id = path.split("/").at(-1);
    data = { draft_id: id, league_id: id, season: "2026", status: "complete", type: "snake", settings: { teams: 2, rounds: 1 }, slot_to_roster_id: { 1: 1, 2: 2 } };
  } else if (/^\/draft\/browser-[\w-]+\/(picks|traded_picks)$/.test(path)) data = [];
  else if (/^\/league\/browser-[\w-]+$/.test(path)) {
    const id = path.split("/").at(-1);
    data = { league_id: id, name: `Fixture ${id}`, season: "2026", status: "in_season", total_rosters: 2, scoring_settings: { rec: 1 }, roster_positions: ["QB", "BN"] };
  } else if (/^\/league\/browser-[\w-]+\/rosters$/.test(path)) data = [
    { roster_id: 1, owner_id: "fixture-owner", players: ["fixture-qb"], starters: ["fixture-qb"] },
    { roster_id: 2, owner_id: "fixture-other", players: [], starters: [] },
  ];
  else if (/^\/league\/browser-[\w-]+\/users$/.test(path)) data = [
    { user_id: "fixture-owner", display_name: "Browser Team", metadata: { team_name: `Team ${path.split("/")[2]}` } }, { user_id: "fixture-other", display_name: "Other Team" },
  ];
  else if (/^\/league\/browser-[\w-]+\/matchups\/\d+$/.test(path)) data = [
    { roster_id: 1, matchup_id: 1, starters: ["fixture-qb"], players: ["fixture-qb"], points: 0 },
    { roster_id: 2, matchup_id: 1, starters: [], players: [], points: 0 },
  ];
  else if (/^\/league\/browser-[\w-]+\/transactions\/\d+$/.test(path)) data = [];
  else throw new Error(`Unconfigured Sleeper fixture path: ${path}`);
  return Response.json(data);
};
