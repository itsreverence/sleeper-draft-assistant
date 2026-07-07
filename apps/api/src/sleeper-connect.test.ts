import { describe, expect, it } from "vitest";

import { buildSleeperConnectResponse, getSleeperConnectOptions } from "./sleeper-connect";

describe("Sleeper connect options", () => {
  it("builds league and draft choices with automatic user roster matching", () => {
    const response = buildSleeperConnectResponse(
      {
        user_id: "user-2",
        username: "manager",
        display_name: "Manager",
      },
      "2026",
      [
        {
          league: {
            league_id: "league-1",
            name: "Home League",
            season: "2026",
            status: "pre_draft",
            total_rosters: 4,
            scoring_settings: { rec: 0.5 },
            roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "BE"],
          },
          rosters: [
            { roster_id: 11, owner_id: "user-1" },
            { roster_id: 12, owner_id: "user-2" },
          ],
          drafts: [
            {
              draft_id: "draft-complete",
              type: "snake",
              status: "complete",
              season: "2025",
              metadata: { name: "Old Draft" },
              settings: { teams: 4, rounds: 3 },
              slot_to_roster_id: { "1": 11, "2": 12 },
            },
            {
              draft_id: "draft-active",
              type: "snake",
              status: "pre_draft",
              season: "2026",
              metadata: { name: "Main Draft" },
              settings: { teams: 4, rounds: 16 },
              slot_to_roster_id: { "1": 11, "2": 12 },
            },
          ],
        },
      ],
    );

    expect(response.user).toMatchObject({ userId: "user-2", username: "manager" });
    expect(response.season).toBe("2026");
    expect(response.leagues).toHaveLength(1);
    expect(response.leagues[0]).toMatchObject({
      leagueId: "league-1",
      name: "Home League",
      scoring: "Half PPR",
      userRosterId: "12",
      recommendedDraftId: "draft-active",
    });
    expect(response.leagues[0]?.rosterSlots).toMatchObject({ QB: 1, RB: 1, WR: 1, TE: 1, FLEX: 1, BN: 1 });
    expect(response.leagues[0]?.drafts[1]).toMatchObject({
      draftId: "draft-active",
      name: "Main Draft",
      userDraftSlot: 2,
      teams: 4,
      rounds: 16,
    });
  });
  it("includes a direct league URL when user league listing omits a new predraft league", async () => {
    const client = {
      getUser: async () => ({ user_id: "user-2", username: "manager", display_name: "Manager" }),
      getNflState: async () => ({ league_season: "2026" }),
      getUserLeagues: async () => [],
      getLeague: async () => ({
        league_id: "1377904033301278720",
        name: "Temple OS Enjoyers",
        season: "2026",
        status: "pre_draft",
        total_rosters: 8,
        scoring_settings: { rec: 1 },
        roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF", "BN"],
        draft_id: "1377904033871716352",
      }),
      getLeagueRosters: async () => [{ roster_id: 1, owner_id: "user-2" }],
      getLeagueDrafts: async () => [
        {
          draft_id: "1377904033871716352",
          league_id: "1377904033301278720",
          status: "pre_draft",
          type: "snake",
          season: "2026",
          metadata: { name: "Temple OS Enjoyers" },
          settings: { teams: 8, rounds: 15 },
        },
      ],
      getDraft: async () => {
        throw new Error("getDraft should not be needed when league drafts are returned");
      },
    };

    const response = await getSleeperConnectOptions(
      client as never,
      "manager",
      "2026",
      "https://sleeper.com/leagues/1377904033301278720/predraft",
    );

    expect(response.leagues).toHaveLength(1);
    expect(response.leagues[0]).toMatchObject({
      leagueId: "1377904033301278720",
      name: "Temple OS Enjoyers",
      userRosterId: "1",
      recommendedDraftId: "1377904033871716352",
    });
  });
});