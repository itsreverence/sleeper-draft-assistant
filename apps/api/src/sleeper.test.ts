import { describe, expect, it } from "vitest";

import { normalizeSleeperDraftState, type SleeperDraftStateInput } from "./sleeper";

const fixture: SleeperDraftStateInput = {
  draft: {
    draft_id: "draft-1",
    league_id: "league-1",
    status: "drafting",
    settings: {
      teams: 4,
      rounds: 3,
    },
    slot_to_roster_id: {
      "1": 11,
      "2": 12,
      "3": 13,
      "4": 14,
    },
  },
  league: {
    league_id: "league-1",
    name: "Fixture League",
    total_rosters: 4,
    scoring_settings: {
      rec: 1,
    },
    roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN"],
  },
  rosters: [
    { roster_id: 11, owner_id: "user-1" },
    { roster_id: 12, owner_id: "user-2" },
    { roster_id: 13, owner_id: "user-3" },
    { roster_id: 14, owner_id: "user-4" },
  ],
  users: [
    { user_id: "user-1", display_name: "Alpha" },
    { user_id: "user-2", display_name: "Bravo", metadata: { team_name: "Bravo Squad" } },
    { user_id: "user-3", display_name: "Charlie" },
    { user_id: "user-4", username: "delta" },
  ],
  picks: [
    { pick_no: 1, round: 1, draft_slot: 1, roster_id: 11, player_id: "p1" },
    { pick_no: 2, round: 1, draft_slot: 2, roster_id: 12, player_id: "p2" },
    { pick_no: 3, round: 1, draft_slot: 3, roster_id: 13, player_id: "p3" },
  ],
  players: {
    p1: {
      player_id: "p1",
      full_name: "Player One",
      team: "MIN",
      position: "WR",
      fantasy_positions: ["WR"],
      status: "Active",
      search_rank: 1,
      sport: "nfl",
    },
    p2: {
      player_id: "p2",
      first_name: "Player",
      last_name: "Two",
      team: "SF",
      position: "RB",
      fantasy_positions: ["RB"],
      injury_status: "Questionable",
      status: "Active",
      search_rank: 2,
      sport: "nfl",
    },
    p3: {
      player_id: "p3",
      full_name: "Player Three",
      team: "BUF",
      position: "QB",
      fantasy_positions: ["QB"],
      status: "Active",
      search_rank: 3,
      sport: "nfl",
    },
    p4: {
      player_id: "p4",
      full_name: "Player Four",
      team: "KC",
      position: "TE",
      fantasy_positions: ["TE"],
      status: "Active",
      search_rank: 4,
      sport: "nfl",
    },
    idp1: {
      player_id: "idp1",
      full_name: "Defensive Player",
      team: "DAL",
      position: "LB",
      fantasy_positions: ["LB"],
      status: "Active",
      search_rank: 10,
      sport: "nfl",
    },
  },
  userRosterId: "12",
};

describe("Sleeper draft normalization", () => {
  it("maps Sleeper draft, league, teams, picks, and players into DraftState", () => {
    const state = normalizeSleeperDraftState(fixture);

    expect(state.id).toBe("draft-1");
    expect(state.name).toBe("Fixture League");
    expect(state.status).toBe("drafting");
    expect(state.currentPick).toBe(4);
    expect(state.userTeamId).toBe("roster-12");
    expect(state.settings.scoring).toBe("PPR");
    expect(state.settings.rosterSlots).toMatchObject({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, BN: 2 });
    expect(state.teams.map((team) => team.name)).toEqual(["Alpha", "Bravo Squad", "Charlie", "delta"]);
    expect(state.teams[1]?.roster).toEqual(["p2"]);
    expect(state.picks[2]).toMatchObject({ pickNo: 3, round: 1, draftSlot: 3, teamId: "roster-13" });
    expect(state.players.map((player) => player.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(state.players.find((player) => player.id === "p2")?.riskTags).toEqual(["injury: Questionable"]);
  });

  it("falls back to league roster count when slot mapping is absent", () => {
    const state = normalizeSleeperDraftState({
      ...fixture,
      draft: {
        ...fixture.draft,
        settings: {},
        slot_to_roster_id: {},
      },
    });

    expect(state.settings.teams).toBe(4);
    expect(state.teams).toHaveLength(4);
  });
  it("resolves draft_order owner IDs through league rosters when slot mapping is absent", () => {
    const state = normalizeSleeperDraftState({
      ...fixture,
      draft: {
        ...fixture.draft,
        slot_to_roster_id: null,
        draft_order: {
          "user-1": 1,
          "user-2": 2,
          "user-3": 3,
          "user-4": 4,
        },
      },
    });

    expect(state.teams.map((team) => team.id)).toEqual(["roster-11", "roster-12", "roster-13", "roster-14"]);
    expect(state.picks[1]?.teamId).toBe("roster-12");
  });
  it("resolves pick ownership from picked_by when roster_id and draft_slot are absent", () => {
    const state = normalizeSleeperDraftState({
      ...fixture,
      picks: [
        { pick_no: 1, picked_by: "user-2", player_id: "p2" },
        { pick_no: 2, picked_by: "user-3", player_id: "p3" },
      ],
    });

    expect(state.picks[0]).toMatchObject({ pickNo: 1, teamId: "roster-12", draftSlot: 1 });
    expect(state.picks[1]).toMatchObject({ pickNo: 2, teamId: "roster-13", draftSlot: 2 });
    expect(state.teams.find((team) => team.id === "roster-12")?.roster).toEqual(["p2"]);
    expect(state.teams.find((team) => team.id === "roster-13")?.roster).toEqual(["p3"]);
  });

  it("accepts roster-prefixed user roster ids", () => {
    const state = normalizeSleeperDraftState({
      ...fixture,
      userRosterId: "roster-12",
    });

    expect(state.userTeamId).toBe("roster-12");
  });

  it("advances current pick and rosters across consecutive poll snapshots", () => {
    const before = normalizeSleeperDraftState(fixture);
    const after = normalizeSleeperDraftState({
      ...fixture,
      picks: [
        ...fixture.picks,
        { pick_no: 4, round: 1, draft_slot: 4, roster_id: 14, player_id: "p4" },
      ],
    });

    expect(before.currentPick).toBe(4);
    expect(before.picks).toHaveLength(3);
    expect(before.teams.find((team) => team.id === "roster-14")?.roster).toEqual([]);
    expect(after.currentPick).toBe(5);
    expect(after.picks).toHaveLength(4);
    expect(after.picks[3]).toMatchObject({ pickNo: 4, round: 1, draftSlot: 4, teamId: "roster-14" });
    expect(after.teams.find((team) => team.id === "roster-14")?.roster).toEqual(["p4"]);
  });
});

