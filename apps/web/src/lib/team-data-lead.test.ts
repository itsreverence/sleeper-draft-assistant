import { buildTeamDataReadiness } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import { teamDataLead, type TeamDataLeadInput } from "./team-data-lead";
import { createTeamPayloadFixture } from "./testing/draft-fixtures";
import type { Player, Position, TeamManagerState, WeeklyProjectionImportSummary } from "./types";

const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const FRESH = "2026-10-30T12:00:00.000Z";
const OLD = "2026-10-26T12:00:00.000Z";
const ALL: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

function player(position: Position, week = 9): Player {
  return {
    id: `synthetic-${position}`, sleeperId: `synthetic-${position}`, name: `Synthetic ${position}`, team: "BUF", position,
    projectedPoints: 10, projectionSource: "weekly_projection", weeklyProjectedPoints: 10,
    weeklyProjectionSeason: "2026", weeklyProjectionWeek: week, adp: null, tier: null, riskTags: [],
  } as Player;
}

function teamState(overrides: Partial<TeamManagerState> = {}): TeamManagerState {
  const base = createTeamPayloadFixture().state;
  return {
    ...base,
    seasonPhase: "regular",
    week: 9,
    scheduleStatus: { available: true, week: 9 },
    league: { ...base.league, season: "2026", rosterSlots: Object.fromEntries(ALL.map((position) => [position, 1])) as never },
    roster: { ...base.roster, starters: ALL.map((position) => ({ slot: position, eligiblePositions: [position], player: player(position) })), bench: [] },
    ...overrides,
  };
}

function summaryOf(positions: Position[], overrides: Partial<WeeklyProjectionImportSummary> = {}, appliedAt = FRESH): WeeklyProjectionImportSummary {
  return {
    source: "fantasypros", season: "2026", week: 9, position: null, positions,
    positionResults: positions.map((position) => ({ position, rowsParsed: 30, matched: 30, unmatched: 0, ambiguous: 0, appliedAt })),
    rowsParsed: positions.length * 30, matched: positions.length * 30, unmatched: [], ambiguous: [], appliedAt,
    ...overrides,
  } as WeeklyProjectionImportSummary;
}

function lead(summary: WeeklyProjectionImportSummary | null, options: Partial<TeamDataLeadInput> & { state?: TeamManagerState } = {}) {
  const state = options.state ?? teamState();
  return teamDataLead({ state, readiness: buildTeamDataReadiness(state, summary, NOW), weeklySummary: summary, now: NOW, ...options });
}

describe("Manage data lead", () => {
  it("nothing loaded names the week and offers every file with one source link", () => {
    const result = lead(null);
    expect(result.tone).toBe("warn");
    expect(result.title).toBe("Week 9 has no projections");
    expect(result.action).toMatchObject({ kind: "choose-files", label: "Choose CSV files", season: "2026", week: 9, fallbackPosition: null });
    expect(result.sources).toEqual([{ position: "QB", label: "Open FantasyPros", week: 9 }]);
    expect(result.positions).toEqual([]);
  });

  it("partly loaded names what's missing, with a link per missing position", () => {
    const result = lead(summaryOf(["QB", "RB", "WR", "TE"]));
    expect(result.title).toBe("Week 9 is missing K and DST projections");
    expect(result.action).toMatchObject({ label: "Choose K and DST files", fallbackPosition: null });
    expect(result.sources.map((source) => source.label)).toEqual(["FantasyPros K", "FantasyPros DST"]);
    expect(result.positions.filter((position) => !position.loaded).map((position) => position.position)).toEqual(["K", "DEF"]);
  });

  it("one missing position lets a renamed file take that position", () => {
    const result = lead(summaryOf(["QB", "RB", "WR", "TE", "K"]));
    expect(result.title).toBe("Week 9 is missing DST projections");
    expect(result.action).toMatchObject({ label: "Choose DST file", fallbackPosition: "DEF" });
  });

  it("a file that matched nobody counts as missing and says why", () => {
    const summary = summaryOf(ALL);
    summary.positionResults = summary.positionResults.map((result) => result.position === "K" ? { ...result, matched: 0, unmatched: 30 } : result);
    const result = lead(summary);
    expect(result.title).toBe("Week 9 is missing K projections");
    expect(result.detail).toContain("K file imported, but no players matched.");
  });

  it("all loaded has no alarm and no primary button", () => {
    const result = lead(summaryOf(ALL));
    expect(result).toMatchObject({ tone: "clear", title: "Week 9 projections are loaded", action: null, sources: [], view: null });
    expect(result.detail).toBe("Weekly evidence is ready for the Assistant.");
  });

  it("only asks about positions this league uses", () => {
    const base = teamState();
    const noKicker = ALL.filter((position) => position !== "K");
    const state = teamState({
      league: { ...base.league, rosterSlots: Object.fromEntries(noKicker.map((position) => [position, 1])) as never },
      roster: { ...base.roster, starters: noKicker.map((position) => ({ slot: position, eligiblePositions: [position], player: player(position) })) },
    });
    expect(lead(summaryOf(noKicker), { state }).tone).toBe("clear");
    expect(lead(summaryOf(noKicker), { state }).positions.map((position) => position.position)).toEqual(noKicker);
  });

  it("old files are never loaded, even complete and even when partly loaded", () => {
    const complete = lead(summaryOf(ALL, {}, OLD));
    expect(complete).toMatchObject({ tone: "warn", title: "Week 9 projections are 5 days old", action: { label: "Choose CSV files" } });
    expect(lead(summaryOf(["QB"], {}, OLD)).title).toBe("Week 9 projections are 5 days old");
  });

  it("a mixed import takes its age from the oldest file", () => {
    const summary = summaryOf(ALL);
    summary.positionResults[0] = { ...summary.positionResults[0]!, appliedAt: OLD };
    expect(lead(summary).title).toBe("Week 9 projections are 5 days old");
  });

  it("files that aged out after the payload was built stop reading as loaded", () => {
    const summary = summaryOf(ALL);
    const state = teamState();
    const result = teamDataLead({ state, readiness: buildTeamDataReadiness(state, summary, NOW), weeklySummary: summary, now: NOW + 4 * 86_400_000 });
    expect(result.tone).toBe("warn");
    expect(result.title).toMatch(/^Week 9 projections are \d days old$/);
  });

  it("an undated import is not treated as fresh", () => {
    expect(lead(summaryOf(ALL, {}, "not a date")).title).toBe("Week 9 projections have no saved date");
  });

  it("a coverage gap with every file present is reported, not cleared", () => {
    const base = teamState();
    const state = teamState({ roster: { ...base.roster, starters: base.roster.starters.map((slot) => ({ ...slot, player: { ...slot.player!, projectionSource: "sleeper_search_rank" } as Player })) } });
    const result = lead(summaryOf(ALL), { state });
    expect(result).toMatchObject({ tone: "warn", title: "Week 9 projections have coverage gaps", action: { kind: "choose-files" } });
  });

  it("another season's files are not usable, and new files go to the league's season", () => {
    const result = lead(summaryOf(ALL, { season: "2025", week: 5 }), { selectedSeason: "2025", selectedWeek: 5 });
    expect(result).toMatchObject({ tone: "warn", title: "Saved projections are for 2025", action: { season: "2026", week: 5 } });
    expect(result.detail).toContain("not used by lineup, waiver, or Assistant advice");
    expect(result.view).toEqual({ text: "Viewing 2025 Week 5; this league is 2026.", back: { season: "2026", week: 9 } });
    expect(result.positions).toEqual([]);
  });

  it("viewing another season with nothing saved doesn't read as this season's gap", () => {
    expect(lead(null, { selectedSeason: "2025", selectedWeek: 5 }).title).toBe("Viewing the 2025 season");
  });

  it("states the week of the accepted payload and offers a way back", () => {
    const base = teamState();
    const state = teamState({ roster: { ...base.roster, starters: ALL.map((position) => ({ slot: position, eligiblePositions: [position], player: player(position, 7) })) } });
    const result = lead(summaryOf(ALL, { week: 7 }), { state, selectedWeek: 7 });
    expect(result.title).toBe("Week 7 projections are loaded");
    expect(result.tone).toBe("note");
    expect(result.view).toEqual({
      text: "Viewing Week 7; Sleeper currently reports Week 9. Advice will use the selected week's saved projections.",
      back: { season: "2026", week: 9 },
    });
  });

  it("files for a different week than the payload never read as loaded", () => {
    const result = lead(summaryOf(ALL, { week: 7 }), { selectedWeek: 8 });
    expect(result).toMatchObject({ tone: "warn", title: "Saved projections are for Week 7", action: { week: 8 } });
    expect(result.positions).toEqual([]);
  });

  it("preseason and postseason make no weekly claim", () => {
    const preseason = lead(summaryOf(ALL), { state: teamState({ seasonPhase: "preseason", week: null }) });
    expect(preseason).toMatchObject({ tone: "note", title: "Regular-season weekly advice is not active yet", action: null, sources: [], positions: [] });
    const postseason = lead(null, { state: teamState({ seasonPhase: "postseason" }) });
    expect(postseason).toMatchObject({ tone: "note", title: "The regular season is over", action: null });
  });

  it("an unknown week asks for one, even with files on screen", () => {
    const result = lead(summaryOf(ALL), { state: teamState({ seasonPhase: "unknown", week: null }) });
    expect(result).toMatchObject({ tone: "warn", title: "Current week unknown", action: { kind: "choose-week" } });
  });

  it("a failed import never reads as loaded, and offers files again", () => {
    const result = lead(summaryOf(ALL), { weeklyError: "Synthetic failure." });
    expect(result).toMatchObject({ tone: "warn", title: "Weekly projections didn't update", action: { kind: "choose-files" } });
    expect(result.detail).toBe("Week 9 still uses the files saved earlier.");
  });

  it("a failed refresh never reads as loaded", () => {
    const result = lead(summaryOf(ALL), { refreshFailed: true });
    expect(result).toMatchObject({ tone: "warn", title: "Can't confirm Week 9", action: null });
    expect(lead(null, { refreshFailed: true }).notice).toBe("The last refresh failed. This is earlier Sleeper data.");
  });

  it("a season value failure or missing schedule removes the all-clear dot without an alarm", () => {
    expect(lead(summaryOf(ALL), { rosError: "Synthetic failure." })).toMatchObject({ tone: "note", action: null });
    const state = teamState({ scheduleStatus: { available: false, week: 9 } });
    expect(lead(summaryOf(ALL), { state })).toMatchObject({ tone: "note", action: null });
  });

  it("a load in progress or a missing team claims nothing", () => {
    expect(lead(summaryOf(ALL), { isLoading: true })).toMatchObject({ tone: "note", title: "Checking weekly data", action: null, positions: [] });
    expect(teamDataLead({ state: null, readiness: null, weeklySummary: null })).toMatchObject({ tone: "note", action: null });
  });
});
