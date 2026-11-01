import { syntheticSchedule } from "../../apps/api/src/testing/schedule-fixture.ts";

// Only the test-owned API process loads this upstream fixture. Application
// normalization, authorization, parsers, routes and SQLite remain real.
if (process.env.SDA_BROWSER_TEST !== "1") throw new Error("Browser fixture requires isolated runner");

// Four-team drafts for pick-order scenarios. The user connects as roster 2 (slot 2).
const boardDrafts = {
  "browser-board-traded": { type: "snake", status: "drafting", picks: 8, traded: [{ season: "2026", round: 3, roster_id: 1, previous_owner_id: 1, owner_id: 2 }] },
  "browser-board-linear": { type: "linear", status: "drafting", picks: 6 },
  "browser-board-reversal": { type: "snake", status: "drafting", picks: 8, settings: { reversal_round: 3 } },
  "browser-board-pre": { type: "snake", status: "pre_draft", picks: 0 },
  "browser-board-prep-desktop": { type: "snake", status: "pre_draft", picks: 0 },
  "browser-board-prep-compact": { type: "snake", status: "pre_draft", picks: 0 },
};
const boardSlot = (draft, pickNo) => {
  const round = Math.ceil(pickNo / 4);
  const inRound = (pickNo - 1) % 4;
  const reversal = draft.settings?.reversal_round ?? 0;
  const forward = draft.type === "linear" || (round % 2 === 1) === !(reversal > 1 && round >= reversal);
  return forward ? inRound + 1 : 4 - inRound;
};

const player = { player_id: "fixture-qb", full_name: "Test Quarterback", first_name: "Test", last_name: "Quarterback", team: "BUF", position: "QB", fantasy_positions: ["QB"], active: true, status: "Active" };
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input);
  if (url.origin !== "https://api.sleeper.app") throw new Error("Unexpected external request in browser fixture");
  const path = url.pathname.replace(/^\/v1/, "");
  let data;
  if (path === "/state/nfl") data = { season: "2026", league_season: "2026", season_type: "regular", week: 2, display_week: 2 };
  else if (path === "/schedule/nfl/regular/2026") data = syntheticSchedule;
  else if (path === "/players/nfl") data = { "fixture-qb": player };
  else if (/^\/players\/nfl\/trending\//.test(path)) data = [];
  else if (boardDrafts[path.split("/").at(-1)] && path.startsWith("/draft/")) {
    const id = path.split("/").at(-1);
    const draft = boardDrafts[id];
    data = { draft_id: id, league_id: id, season: "2026", status: draft.status, type: draft.type, settings: { teams: 4, rounds: 4, ...draft.settings }, slot_to_roster_id: { 1: 1, 2: 2, 3: 3, 4: 4 } };
  } else if (/^\/draft\/browser-board-[\w-]+\/picks$/.test(path)) {
    const draft = boardDrafts[path.split("/")[2]];
    data = Array.from({ length: draft.picks }, (_, index) => {
      const slot = boardSlot(draft, index + 1);
      return { player_id: "fixture-qb", roster_id: slot, round: Math.ceil((index + 1) / 4), draft_slot: slot, pick_no: index + 1, metadata: {} };
    });
  } else if (/^\/draft\/browser-board-[\w-]+\/traded_picks$/.test(path)) data = boardDrafts[path.split("/")[2]].traded ?? [];
  else if (boardDrafts[path.split("/").at(-1)] && path.startsWith("/league/")) {
    const id = path.split("/").at(-1);
    data = { league_id: id, name: `Fixture ${id}`, season: "2026", status: "drafting", total_rosters: 4, scoring_settings: { rec: 1 }, roster_positions: ["QB", "BN", "BN", "BN"] };
  } else if (/^\/league\/browser-board-[\w-]+\/rosters$/.test(path)) data = [1, 2, 3, 4].map(roster_id => ({ roster_id, owner_id: `owner-${roster_id}`, players: [], starters: [] }));
  else if (/^\/league\/browser-board-[\w-]+\/users$/.test(path)) data = [1, 2, 3, 4].map(n => ({ user_id: `owner-${n}`, display_name: `Team ${n}`, metadata: { team_name: `Team ${n}` } }));
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
