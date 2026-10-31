import { describe, expect, it } from "vitest";

import { attentionHeading, lineupAnnouncement, lineupCheck, starterAttention, type LineupCheck } from "./team-attention";
import type { Player, Position, TeamManagerState, WeeklyProjectionImportSummary } from "./types";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");

function player(name: string, position: Position, overrides: Partial<Player> = {}): Player {
  return {
    id: name, sleeperId: name, name, team: "BUF", position,
    projectedPoints: 10, projectionSource: "weekly_projection", adp: null, tier: null, riskTags: [],
    weeklyProjectedPoints: 12.5,
    schedule: { season: "2026", week: 8, source: "sleeper", onBye: false, opponent: "MIA", homeAway: "home", gameStatus: "pre_game" },
    sleeperStatus: { rosterStatus: "Active", injuryStatus: null, injuryStartDate: null, practiceParticipation: null, depthChartPosition: null, depthChartOrder: null, newsUpdatedAt: null },
    ...overrides,
  } as Player;
}

function status(overrides: Partial<NonNullable<Player["sleeperStatus"]>>): Player["sleeperStatus"] {
  return { rosterStatus: "Active", injuryStatus: null, injuryStartDate: null, practiceParticipation: null, depthChartPosition: null, depthChartOrder: null, newsUpdatedAt: null, ...overrides };
}

function teamState(starters: Array<[string, Player | null]>, overrides: Partial<TeamManagerState> = {}): TeamManagerState {
  return {
    seasonPhase: "regular", week: 8,
    scheduleStatus: { available: true, week: 8 },
    league: { id: "league", name: "League", season: "2026", status: "in_season", teams: 12, scoring: "PPR", rosterSlots: {} },
    userTeam: { rosterId: "1", ownerId: null, name: "My Team" },
    roster: { starters: starters.map(([slot, entry]) => ({ slot, eligiblePositions: [slot], player: entry })), bench: [], injuredReserve: [], taxi: [], positionCounts: {} },
    updatedAt: "2026-10-30T00:00:00.000Z",
    dataQuality: { playerValueSource: "", limitations: [] },
    ...overrides,
  };
}

function summary(results: Array<[Position, number, number]>, appliedAt = "2026-10-30T00:00:00.000Z"): WeeklyProjectionImportSummary {
  return {
    source: "fantasypros", season: "2026", week: 8, position: results[0]![0], positions: results.map(([position]) => position),
    positionResults: results.map(([position, matched, rowsParsed]) => ({ position, matched, rowsParsed, unmatched: rowsParsed - matched, ambiguous: 0, appliedAt })),
    matched: 0, rowsParsed: 0, unmatched: [], ambiguous: [], appliedAt,
  } as WeeklyProjectionImportSummary;
}

const loaded = summary([["QB", 30, 30], ["RB", 60, 60], ["WR", 90, 90]]);

function labels(check: LineupCheck) {
  if (check.state !== "needs-look") throw new Error(`Expected items, got ${check.state}`);
  return check.items.map((item) => item.label);
}

const check = (state: TeamManagerState, weeklySummary: WeeklyProjectionImportSummary | null = loaded, extra = {}) =>
  lineupCheck({ state, weeklySummary, now: NOW, ...extra });

describe("lineup attention rules", () => {
  it("reports a truthful fact and never says starters are playing when nothing is flagged", () => {
    const result = check(teamState([["QB", player("Q", "QB")], ["RB", player("R", "RB")]]));
    expect(result).toEqual({ state: "clear", detail: "2 starters, no byes or status flags, all projected for Week 8" });
    expect(lineupAnnouncement(result)).toBe("Lineup looks set.");
  });

  it("flags a starter on bye and asks without recommending anyone", () => {
    const onBye = player("Brock Purdy", "QB", { weeklyProjectedPoints: null, schedule: { season: "2026", week: 8, source: "sleeper", onBye: true, opponent: null, homeAway: null, gameStatus: null } });
    const result = check(teamState([["QB", onBye]]));
    expect(labels(result)).toEqual(["Brock Purdy is on bye"]);
    const item = starterAttention(result).get("starter-0");
    expect(item?.question).toBe("Brock Purdy is on bye in Week 8. Who should I start at QB?");
  });

  it("quotes Sleeper's status verbatim, with red only for out and IR", () => {
    const result = check(teamState([
      ["RB", player("De'Von Achane", "RB", { sleeperStatus: status({ injuryStatus: "Questionable" }) })],
      ["RB", player("Gone Back", "RB", { sleeperStatus: status({ injuryStatus: "Out" }) })],
      ["WR", player("Cut Receiver", "WR", { sleeperStatus: status({ rosterStatus: "Inactive" }) })],
      ["WR", player("Sore Receiver", "WR", { sleeperStatus: status({ practiceParticipation: "Did not participate" }) })],
    ]));
    expect(labels(result)).toEqual([
      "De'Von Achane is listed Questionable",
      "Gone Back is listed Out",
      "Cut Receiver is listed Inactive",
      "Sore Receiver is listed DNP",
    ]);
    const flags = starterAttention(result);
    expect(flags.get("starter-0")?.tone).toBe("warning");
    expect(flags.get("starter-1")?.tone).toBe("danger");
    expect(flags.get("starter-0")?.question).toBe("Sleeper lists De'Von Achane as Questionable. Should I change anything at RB?");
  });

  it("raises one item for a starter on bye with an injury status", () => {
    const both = player("Hurt Bye", "WR", { weeklyProjectedPoints: null, sleeperStatus: status({ injuryStatus: "Doubtful" }), schedule: { season: "2026", week: 8, source: "sleeper", onBye: true, opponent: null, homeAway: null, gameStatus: null } });
    expect(labels(check(teamState([["WR", both]])))).toEqual(["Hurt Bye is on bye"]);
  });

  it("flags an empty starting slot by its display name, row and question", () => {
    const result = check(teamState([["QB", player("Q", "QB")], ["WRRB_FLEX", null]]));
    expect(labels(result)).toEqual(["W/R slot is empty"]);
    expect(starterAttention(result).get("starter-1")?.question).toBe("How should I fill my open W/R slot?");
  });

  it("ignores bench, injured reserve, and taxi players", () => {
    const state = teamState([["QB", player("Q", "QB")]]);
    const hurt = player("Bench Hurt", "RB", { weeklyProjectedPoints: null, sleeperStatus: status({ injuryStatus: "Out" }) });
    state.roster.bench = [hurt];
    state.roster.injuredReserve = [hurt];
    state.roster.taxi = [hurt];
    expect(check(state).state).toBe("clear");
  });

  it("does not clear a starter whose bye status is unknown", () => {
    const freeAgent = player("Free Agent", "WR", { team: "FA", schedule: { season: "2026", week: 8, source: "unknown", onBye: null, opponent: null, homeAway: null, gameStatus: null } });
    expect(labels(check(teamState([["WR", freeAgent]])))).toEqual(["Free Agent's bye status is unknown"]);
  });

  it("reports an unavailable schedule once, opening the readiness section, instead of per player", () => {
    const unknown = player("Q", "QB", { schedule: { season: "2026", week: 8, source: "unknown", onBye: null, opponent: null, homeAway: null, gameStatus: null } });
    const result = check(teamState([["QB", unknown]], { scheduleStatus: { available: false, week: 8 } }));
    expect(result).toEqual({ state: "needs-look", items: [expect.objectContaining({ kind: "data", label: "NFL schedule unavailable, so some byes are unknown", section: "readiness" })] });
  });

  it("omits the schedule item outside a weekly view", () => {
    const result = check(teamState([["QB", player("Q", "QB")]], { seasonPhase: "preseason", week: null, scheduleStatus: { available: false, week: null } }));
    expect(result).toEqual({ state: "note", text: "Preseason. Weekly lineup checks start with Week 1." });
  });

  describe("projection data", () => {
    const unprojected = (name: string, position: Position) => player(name, position, { weeklyProjectedPoints: null, projectionSource: "season_projection" });

    it("raises one item when nothing is imported", () => {
      const result = check(teamState([["QB", unprojected("Q", "QB")], ["RB", unprojected("R", "RB")]]), null);
      expect(result).toEqual({ state: "needs-look", items: [expect.objectContaining({ label: "No Week 8 projections imported", section: "weekly-files" })] });
    });

    it("distinguishes a missing file, a zero-match file, an empty file, and a starter with no match", () => {
      const result = check(teamState([
        ["QB", unprojected("Q", "QB")],
        ["RB", unprojected("R", "RB")],
        ["WR", unprojected("W1", "WR")],
        ["WR", unprojected("W2", "WR")],
        ["DEF", unprojected("D", "DEF")],
      ]), summary([["RB", 0, 40], ["WR", 80, 90], ["DEF", 0, 0]]));
      expect(labels(result)).toEqual([
        "QB projections missing",
        "RB projections matched no players",
        "2 WR starters have no projection match",
        "DST projection file has no rows",
      ]);
    });

    it("reports a stale import once rather than each gap", () => {
      const stale = summary([["QB", 30, 30]], "2026-10-20T00:00:00.000Z");
      expect(labels(check(teamState([["QB", unprojected("Q", "QB")], ["RB", unprojected("R", "RB")]]), stale))).toEqual(["Weekly projections are 3 or more days old"]);
    });

    it("does not raise a projection item for a starter on bye or for a bench gap", () => {
      const onBye = unprojected("Q", "QB");
      onBye.schedule = { season: "2026", week: 8, source: "sleeper", onBye: true, opponent: null, homeAway: null, gameStatus: null };
      const state = teamState([["QB", onBye]]);
      state.roster.bench = [unprojected("Bench", "RB")];
      expect(labels(check(state, null))).toEqual(["Q is on bye"]);
    });
  });

  describe("states that cannot be cleared", () => {
    const hurt = () => player("Q", "QB", { sleeperStatus: status({ injuryStatus: "Out" }) });

    it.each([
      ["preseason", "Preseason. Weekly lineup checks start with Week 1."],
      ["postseason", "Postseason. There is no weekly lineup to check."],
    ] as const)("%s shows a note and no items, even with a flagged starter", (seasonPhase, text) => {
      expect(check(teamState([["QB", hurt()], ["RB", null]], { seasonPhase, week: null }))).toEqual({ state: "note", text });
    });

    it("an unknown phase with no selected week asks for one and keeps week-independent facts", () => {
      const noSchedule = player("Q", "QB", { schedule: { season: "2026", week: null, source: "unknown", onBye: null, opponent: null, homeAway: null, gameStatus: null }, weeklyProjectedPoints: null });
      const result = check(teamState([["QB", noSchedule], ["RB", null]], { seasonPhase: "unknown", week: 8 }), null);
      expect(labels(result)).toEqual(["RB slot is empty", "Current week unknown. Choose one"]);
      expect(result).toMatchObject({ items: [{}, { kind: "data", section: "weekly-week" }] });
    });

    it("never clears an unknown week even when no starter has a fact to report", () => {
      const result = check(teamState([], { seasonPhase: "unknown", week: null }), null);
      expect(labels(result)).toEqual(["Current week unknown. Choose one"]);
    });

    it("an unknown phase with a selected week runs the weekly rules", () => {
      const state = teamState([["QB", player("Q", "QB", { sleeperStatus: status({ injuryStatus: "Out" }) })]], { seasonPhase: "unknown", week: null });
      expect(labels(check(state, loaded, { selectedWeek: 8 }))).toEqual(["Q is listed Out"]);
      expect(check(teamState([["QB", player("Q", "QB")]], { seasonPhase: "unknown", week: null }), loaded, { selectedWeek: 8 })).toEqual({
        state: "note", text: "Nothing flagged for Week 8. Sleeper's active week is unknown.",
      });
    });

    it("a regular season with no week asks for one", () => {
      expect(labels(check(teamState([["QB", player("Q", "QB")]], { week: null }), loaded))).toEqual(["Current week unknown. Choose one"]);
    });

    it("a pinned other week says so rather than claiming the lineup is set", () => {
      expect(check(teamState([["QB", player("Q", "QB")]]), loaded, { selectedWeek: 3 })).toEqual({
        state: "note", text: "Nothing flagged for Week 3. Sleeper's active week is 8.",
      });
    });

    it("a failed refresh does not claim all clear on earlier data", () => {
      expect(check(teamState([["QB", player("Q", "QB")]]), loaded, { refreshFailed: true })).toEqual({
        state: "note", text: "Nothing flagged, but the last refresh failed. This is earlier Sleeper data.",
      });
    });

    it("no starting slots is not all clear", () => {
      expect(check(teamState([]))).toEqual({ state: "note", text: "Sleeper reports no starting slots for this team." });
    });
  });

  it("makes the heading's count match its items, with an accurate singular", () => {
    expect(attentionHeading(1)).toBe("1 thing needs a look");
    expect(attentionHeading(3)).toBe("3 things need a look");
    const result = check(teamState([["QB", null], ["RB", null], ["WR", null]]));
    expect(lineupAnnouncement(result)).toBe("3 things need a look: QB slot is empty. RB slot is empty. WR slot is empty.");
  });

  it("gives no starter a flag when the check has no items", () => {
    expect(starterAttention(null).size).toBe(0);
    expect(starterAttention({ state: "clear", detail: "" }).size).toBe(0);
  });
});
