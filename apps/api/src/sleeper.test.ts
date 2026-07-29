import { afterEach, describe, expect, it, vi } from "vitest";

import { SleeperApiError, SleeperClient, normalizeSleeperActivitySummary, normalizeSleeperAvailablePlayers, normalizeSleeperDraftState, normalizeSleeperTeamManagerState, normalizeSleeperTeamWeekContext, type SleeperDraftStateInput } from "./sleeper";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Sleeper client resilience", () => {
  it("retries temporary network failures", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user_id: "user-1", username: "alpha" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await new SleeperClient("https://example.test").getUser("alpha");

    expect(user.user_id).toBe("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("turns repeated network failures into a useful Sleeper error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(new SleeperClient("https://example.test").getUser("alpha"))
      .rejects.toEqual(expect.objectContaining<SleeperApiError>({
        name: "SleeperApiError",
        message: expect.stringContaining("Could not reach Sleeper"),
      }));
  });
});

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
    expect(state.leagueId).toBe("league-1");
    expect(state.name).toBe("Fixture League");
    expect(state.status).toBe("drafting");
    expect(state.currentPick).toBe(4);
    expect(state.userTeamId).toBe("roster-12");
    expect(state.settings.scoring).toBe("PPR");
    expect(state.settings.formatCompatibility).toMatchObject({ level: "supported" });
    expect(state.settings.rosterSlots).toMatchObject({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, BN: 2 });
    expect(state.teams.map((team) => team.name)).toEqual(["Alpha", "Bravo Squad", "Charlie", "delta"]);
    expect(state.teams[1]?.roster).toEqual(["p2"]);
    expect(state.picks[2]).toMatchObject({ pickNo: 3, round: 1, draftSlot: 3, teamId: "roster-13" });
    expect(state.players.map((player) => player.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(state.players.find((player) => player.id === "p2")?.riskTags).toEqual(["injury: Questionable"]);
  });

  it("normalizes half-PPR superflex as a supported format", () => {
    const state = normalizeSleeperDraftState({
      ...fixture,
      league: {
        ...fixture.league!,
        scoring_settings: { rec: 0.5 },
        roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "SUPER_FLEX", "BN"],
      },
    });

    expect(state.settings.scoring).toBe("Half PPR");
    expect(state.settings.formatCompatibility).toMatchObject({
      level: "supported",
      features: ["superflex"],
    });
  });

  it("surfaces unsupported IDP and auction settings", () => {
    const state = normalizeSleeperDraftState({
      ...fixture,
      draft: { ...fixture.draft, type: "auction" },
      league: {
        ...fixture.league!,
        roster_positions: ["QB", "RB", "WR", "TE", "LB", "DB", "BN"],
      },
    });

    expect(state.settings.formatCompatibility).toMatchObject({
      level: "unsupported",
      features: expect.arrayContaining(["idp", "auction"]),
    });
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


describe("Sleeper team manager normalization", () => {
  it("maps Sleeper league roster data into a team manager state", () => {
    const state = normalizeSleeperTeamManagerState({
      league: fixture.league!,
      rosters: [
        {
          roster_id: 12,
          owner_id: "user-2",
          players: ["p2", "p3", "p4", "p1"],
          starters: ["p3", "p2", "p1", "p4"],
          reserve: ["p4"],
          taxi: ["p1"],
        },
      ],
      users: fixture.users!,
      players: fixture.players,
      userRosterId: "12",
      week: 1,
    });

    expect(state.league).toMatchObject({ id: "league-1", name: "Fixture League", scoring: "PPR", teams: 4 });
    expect(state.league.formatCompatibility).toMatchObject({ level: "supported" });
    expect(state.userTeam).toMatchObject({ rosterId: "12", ownerId: "user-2", name: "Bravo Squad" });
    expect(state.roster.starters.map((slot) => slot.slot)).toEqual(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"]);
    expect(state.roster.starters[0]?.player?.name).toBe("Player Three");
    expect(state.roster.bench).toEqual([]);
    expect(state.roster.injuredReserve.map((player) => player.id)).toEqual(["p4"]);
    expect(state.roster.taxi.map((player) => player.id)).toEqual(["p1"]);
    expect(state.roster.positionCounts).toMatchObject({ QB: 1, RB: 1, WR: 1, TE: 1 });
    expect(state.week).toBe(1);
    expect(state.dataQuality.limitations[0]).toContain("Sleeper roster data");
  });


  it("infers available players by excluding league rostered players", () => {
    const players = normalizeSleeperAvailablePlayers({
      rosters: [{ roster_id: 12, players: ["p2"], starters: ["p3"] }],
      players: fixture.players,
      limit: 10,
    });

    expect(players.map((player) => player.id)).toEqual(["p1", "p4"]);
  });
  it("falls back to the first roster when no user roster id is supplied", () => {
    const state = normalizeSleeperTeamManagerState({
      league: fixture.league!,
      rosters: fixture.rosters!,
      users: fixture.users!,
      players: fixture.players,
    });

    expect(state.userTeam.rosterId).toBe("11");
    expect(state.userTeam.name).toBe("Alpha");
  });
});

describe("Sleeper weekly matchup normalization", () => {
  it("maps the user matchup and opponent by Sleeper matchup id", () => {
    const context = normalizeSleeperTeamWeekContext({
      league: fixture.league!,
      rosters: fixture.rosters!,
      users: fixture.users!,
      players: fixture.players,
      userRosterId: "12",
      week: 3,
      matchups: [
        {
          roster_id: 12,
          matchup_id: 7,
          points: 83.24,
          starters: ["p3", "p2"],
          players: ["p3", "p2"],
          players_points: { p3: 21.12, p2: 14.5 },
        },
        {
          roster_id: 13,
          matchup_id: 7,
          points: 78,
          starters: ["p1", "p4"],
          players: ["p1", "p4"],
          players_points: { p1: 18, p4: 9.4 },
        },
        {
          roster_id: 14,
          matchup_id: 8,
          points: 50,
          starters: ["p2"],
        },
      ],
    });

    expect(context).not.toBeNull();
    expect(context).toMatchObject({
      week: 3,
      matchupId: 7,
      status: "in_progress",
      userRosterId: "12",
      opponentRosterId: "13",
      userTeamName: "Bravo Squad",
      opponentTeamName: "Charlie",
      userPoints: 83.24,
      opponentPoints: 78,
    });
    expect(context?.userStarters[0]).toMatchObject({ playerId: "p3", name: "Player Three", slot: "QB", points: 21.12 });
    expect(context?.opponentStarters.map((player) => player.name)).toEqual(["Player One", "Player Four"]);
    expect(context?.facts).toContain("Opponent: Charlie.");
    expect(context?.limitations[0]).toContain("not a projection model");
  });

  it("returns null when the selected roster has no weekly matchup row", () => {
    const context = normalizeSleeperTeamWeekContext({
      league: fixture.league!,
      rosters: fixture.rosters!,
      users: fixture.users!,
      players: fixture.players,
      userRosterId: "12",
      week: 3,
      matchups: [{ roster_id: 13, matchup_id: 1, points: 0 }],
    });

    expect(context).toBeNull();
  });
});

describe("Sleeper activity normalization", () => {
  it("maps transactions and trending players into team activity context", () => {
    const summary = normalizeSleeperActivitySummary({
      players: fixture.players,
      week: 2,
      transactions: [
        {
          transaction_id: "tx-1",
          type: "waiver",
          status: "complete",
          created: 1760000000000,
          roster_ids: [12],
          adds: { p4: 12 },
          drops: { p1: 12 },
          settings: { waiver_bid: 7 },
        },
      ],
      trendingAdds: [{ player_id: "p2", count: 42 }],
      trendingDrops: [{ player_id: "p1", count: 9 }],
    });

    expect(summary.week).toBe(2);
    expect(summary.recentTransactions[0]).toMatchObject({ type: "waiver", waiverBid: 7 });
    expect(summary.recentTransactions[0]?.description).toContain("added Player Four");
    expect(summary.trendingAdds[0]?.player.name).toBe("Player Two");
    expect(summary.trendingDrops[0]?.count).toBe(9);
    expect(summary.facts).toContain("Top global add: Player Two (42 adds).");
  });
});

