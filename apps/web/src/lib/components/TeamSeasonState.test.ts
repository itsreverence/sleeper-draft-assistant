import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type { WeeklyProjectionImportSummary } from "../types";

import MyTeamPanel from "./MyTeamPanel.svelte";
import { createTeamPayloadFixture } from "../testing/draft-fixtures";

describe("Team Manager season state", () => {
  it.each([0, 1])("keeps an imported zero-match file truthful in the footer and roster (%i rows)", (rowsParsed) => {
    const payload = createTeamPayloadFixture();
    const summary: WeeklyProjectionImportSummary = {
      source: "fantasypros", season: "2026", week: 1, position: "QB", positions: ["QB"],
      positionResults: [{ position: "QB", matched: 0, rowsParsed, unmatched: rowsParsed, ambiguous: 0, appliedAt: "2026-09-01T00:00:00.000Z" }],
      matched: 0, rowsParsed, unmatched: [], ambiguous: [], appliedAt: "2026-09-01T00:00:00.000Z",
    };
    render(MyTeamPanel, {
      state: payload.state, weeklySummary: summary, onManageData: () => {},
      readiness: { ...payload.dataReadiness, status: "partial", confidence: "medium", loadedPositions: [], missingPositions: ["QB"], projectedRosterPlayers: 1 },
    });
    expect(screen.getByText("No match")).toBeTruthy();
    expect(screen.queryByText("No QB file")).toBeNull();
    expect(screen.getByText(/roster coverage/).parentElement?.textContent).toContain(rowsParsed === 0 ? "QB: no rows" : "QB: no matches");
    expect(screen.getByRole("button", { name: "Import weekly projections" })).toBeTruthy();
    expect(screen.queryByText(/QB loaded/)).toBeNull();
  });

  it.each([
    ["SUPER_FLEX", "Superflex"],
    ["WRRB_FLEX", "Wide receiver / running back flex"],
    ["REC_FLEX", "Wide receiver / tight end flex"],
  ])("expands the filled %s slot accessibly", (slot, title) => {
    const payload = createTeamPayloadFixture();
    payload.state.roster.starters[0]!.slot = slot;
    render(MyTeamPanel, { state: payload.state });
    expect(screen.getByRole("cell", { name: title }).getAttribute("title")).toBe(title);
  });

  it("shows accessible bye markers without missing-projection text and a schedule failure note", () => {
    const payload = createTeamPayloadFixture();
    const player = payload.state.roster.starters[0]!.player!;
    player.schedule = { season: "2026", week: 1, source: "draft_import", onBye: true, opponent: null, homeAway: null, gameStatus: null };
    payload.state.scheduleStatus = { available: false, week: 1 };
    render(MyTeamPanel, { state: payload.state, readiness: { ...payload.dataReadiness, projectedRosterPlayers: 1 } });
    expect(screen.getByRole("img", { name: "On bye in Week 1" }).textContent).toBe("BYE");
    expect(screen.getByText("0 pts").classList.contains("muted")).toBe(true);
    expect(screen.getByText(/NFL schedule unavailable/)).toBeTruthy();
  });

  it("gives team, week, and a clear player's empty status their own cells", () => {
    const payload = createTeamPayloadFixture();
    const player = payload.state.roster.starters[0]!.player!;
    player.sleeperStatus = undefined;
    player.schedule = { season: "2026", week: 1, source: "sleeper", onBye: false, opponent: "JAX", homeAway: "away", gameStatus: "pre_game" };
    render(MyTeamPanel, { state: payload.state });
    const row = screen.getByRole("row", { name: new RegExp(player.name) });
    const cells = within(row).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent?.trim())).toEqual(["QB", "@ JAX", ""]);
    expect(within(row).getByRole("rowheader").textContent).toContain(player.team);
    expect(screen.queryByText("Clear", { exact: true })).toBeNull();
  });

  it("shows a selected-week NFL opponent", () => {
    const payload = createTeamPayloadFixture();
    payload.state.roster.starters[0]!.player!.schedule = { season: "2026", week: 1, source: "sleeper", onBye: false, opponent: "KC", homeAway: "away", gameStatus: "pre_game" };
    render(MyTeamPanel, { state: payload.state });
    expect(screen.getByText(/@ KC/)).toBeTruthy();
  });
  it("labels a preseason roster without presenting a regular-season week", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, {
      state: { ...payload.state, seasonPhase: "preseason", week: null },
    });

    expect(screen.getByRole("columnheader", { name: "Week" })).toBeTruthy();
    expect(screen.queryByText("Week 1")).toBeNull();
  });

  it("keeps roster size in the team heading and week and scoring out of it", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, { state: payload.state });

    expect(screen.getByText("1 player")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Week 1" })).toBeTruthy();
    expect(screen.queryByText(/PPR/)).toBeNull();
  });

  it("names the table, its columns, and the bench and IR row groups", () => {
    const payload = createTeamPayloadFixture();
    const starter = payload.state.roster.starters[0]!.player!;
    payload.state.roster.bench = [{ ...starter, id: "bench-player", sleeperId: "bench-player", name: "Bench Player" }];
    payload.state.roster.injuredReserve = [{ ...starter, id: "ir-player", sleeperId: "ir-player", name: "IR Player" }];
    render(MyTeamPanel, { state: payload.state, readiness: { ...payload.dataReadiness, projectedRosterPlayers: 1 } });

    expect(screen.getByRole("table", { name: "Starting lineup and reserves" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Slot", "Player", "Week 1", "Proj", "Status"]);
    expect(screen.getByText("Bench").getAttribute("scope")).toBe("rowgroup");
    expect(screen.getByText("Injured reserve").getAttribute("scope")).toBe("rowgroup");
  });

  it("uses amber text for questionable, red text for out and IR, and On bye only without an injury", () => {
    const payload = createTeamPayloadFixture();
    const starter = payload.state.roster.starters[0]!.player!;
    const withStatus = (name: string, injuryStatus: string, onBye: boolean) => ({
      ...starter,
      id: name,
      sleeperId: name,
      name,
      sleeperStatus: { rosterStatus: "Active", injuryStatus: injuryStatus || null, injuryStartDate: null, practiceParticipation: null, depthChartPosition: null, depthChartOrder: null, newsUpdatedAt: null },
      schedule: { season: "2026", week: 1, source: "sleeper" as const, onBye, opponent: null, homeAway: null, gameStatus: null },
    });
    payload.state.roster.bench = [withStatus("Hurt", "Questionable", false), withStatus("Gone", "Out", false), withStatus("Resting", "", true), withStatus("Hurt On Bye", "Doubtful", true)];
    render(MyTeamPanel, { state: payload.state });

    expect(screen.getByText("Questionable").closest("td")?.classList.contains("tone-warning")).toBe(true);
    expect(screen.getByText("Out").closest("td")?.classList.contains("tone-danger")).toBe(true);
    const onBye = screen.getByText("On bye");
    expect(onBye.closest("td")?.classList.contains("tone-warning")).toBe(true);
    expect(onBye.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByText("On bye")).toHaveLength(1);
    expect(screen.getByText("Doubtful")).toBeTruthy();
    expect(screen.getByText("Out").getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByText("Gone").parentElement?.querySelector("small")?.getAttribute("data-status")).toBe("Out");
    expect(screen.getByText("Resting").parentElement?.querySelector("small")?.hasAttribute("data-status")).toBe(false);
  });

  it("summarizes coverage in a footer with the one action that improves it", async () => {
    const payload = createTeamPayloadFixture();
    let opened = false;
    const readiness = {
      ...payload.dataReadiness,
      status: "partial" as const,
      confidence: "medium" as const,
      loadedPositions: ["QB" as const, "RB" as const],
      missingPositions: ["WR" as const, "DEF" as const],
      projectedRosterPlayers: 5,
      eligibleRosterPlayers: 13,
      rosterProjectionCoverage: 5 / 13,
    };
    const view = render(MyTeamPanel, { state: payload.state, readiness, onManageData: () => (opened = true) });

    expect(screen.getByText("Medium confidence · 5/13 projected").classList.contains("pill-warning")).toBe(true);
    expect(screen.getByRole("meter", { name: "Roster projection coverage" }).getAttribute("aria-valuenow")).toBe("38");
    expect(screen.getByText("38% roster coverage").parentElement?.textContent).toBe("38% roster coverage · QB, RB loaded · WR: missing · DST: missing");
    await fireEvent.click(screen.getByRole("button", { name: "Import weekly projections" }));
    expect(opened).toBe(true);

    await view.rerender({ state: payload.state, readiness: { ...readiness, status: "ready", confidence: "high" }, onManageData: () => undefined });
    expect(screen.queryByRole("button", { name: "Import weekly projections" })).toBeNull();
    expect(screen.getByText("High confidence · 5/13 projected").classList.contains("pill-ready")).toBe(true);
  });

  it("shows Sleeper injury, practice, and depth-chart status on roster rows", () => {
    const payload = createTeamPayloadFixture();
    const player = payload.state.roster.starters[0]?.player;
    if (!player) throw new Error("Expected starter fixture");
    player.sleeperStatus = {
      rosterStatus: "Active",
      injuryStatus: "Questionable",
      injuryStartDate: "2026-08-24",
      practiceParticipation: "Limited",
      depthChartPosition: "QB",
      depthChartOrder: 1,
      newsUpdatedAt: "2026-08-29T12:00:00.000Z",
    };

    render(MyTeamPanel, { state: payload.state });

    expect(screen.getByText("Questionable · Limited")).toBeTruthy();
    expect(screen.getByTitle(/QB1/)).toBeTruthy();
  });

  it("shows actionable Sleeper status for injured-reserve and taxi players", () => {
    const payload = createTeamPayloadFixture();
    const starter = payload.state.roster.starters[0]?.player;
    if (!starter) throw new Error("Expected starter fixture");
    payload.state.roster.injuredReserve = [{
      ...starter,
      id: "ir-player",
      sleeperId: "ir-player",
      name: "IR Player",
      sleeperStatus: {
        rosterStatus: "Injured Reserve",
        injuryStatus: "Out",
        injuryStartDate: null,
        practiceParticipation: null,
        depthChartPosition: "QB",
        depthChartOrder: null,
        newsUpdatedAt: null,
      },
    }];
    payload.state.roster.taxi = [{
      ...starter,
      id: "taxi-player",
      sleeperId: "taxi-player",
      name: "Taxi Player",
    }];

    render(MyTeamPanel, { state: payload.state });

    expect(screen.getByText("Injured reserve")).toBeTruthy();
    expect(screen.getByText("Taxi")).toBeTruthy();
    expect(screen.getByText(/Out · Injured Reserve/)).toBeTruthy();
    expect(screen.getByTitle(/depth: QB/)).toBeTruthy();
  });

  it("keeps matchup and weekly confidence inactive during preseason", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, {
      state: { ...payload.state, seasonPhase: "preseason", week: null },
      readiness: payload.dataReadiness,
      weekContext: null,
      onManageData: () => undefined,
    });

    expect(screen.getByText("Data: 0/2 sources")).toBeTruthy();
    expect(screen.queryByText(/Week 1/)).toBeNull();
    expect(screen.queryByText(/confidence/i)).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("opens team data management from the roster heading", async () => {
    const payload = createTeamPayloadFixture();
    let opened = false;
    render(MyTeamPanel, {
      state: payload.state,
      readiness: payload.dataReadiness,
      weekContext: null,
      onManageData: () => (opened = true),
    });

    await fireEvent.click(screen.getByRole("button", { name: "Manage team data" }));
    expect(opened).toBe(true);
  });

  it("does not label a stored but limited weekly import as ready", () => {
    const payload = createTeamPayloadFixture();
    const weeklySummary = {
      source: "fantasypros",
      season: "2026",
      week: 1,
      position: "QB",
      positions: ["QB"],
      positionResults: [{
        position: "QB",
        rowsParsed: 1,
        matched: 1,
        unmatched: 0,
        ambiguous: 0,
        appliedAt: "2026-09-01T00:00:00.000Z",
      }],
      rowsParsed: 1,
      matched: 1,
      unmatched: [],
      ambiguous: [],
      appliedAt: "2026-09-01T00:00:00.000Z",
    } satisfies WeeklyProjectionImportSummary;

    render(MyTeamPanel, {
      state: payload.state,
      readiness: { ...payload.dataReadiness, status: "limited", confidence: "low" },
      weeklySummary,
      onManageData: () => undefined,
    });

    expect(screen.getByRole("button", { name: "Manage team data" }).getAttribute("title")).toContain("Weekly needs review");
  });

  it("only shows projections when weekly roster coverage exists", async () => {
    const payload = createTeamPayloadFixture();
    const view = render(MyTeamPanel, {
      state: payload.state,
      readiness: { ...payload.dataReadiness, projectedRosterPlayers: 0 },
    });

    expect(screen.queryByText("Proj")).toBeNull();

    await view.rerender({
      state: payload.state,
      readiness: { ...payload.dataReadiness, projectedRosterPlayers: 1 },
    });

    expect(screen.getByText("Proj")).toBeTruthy();
    expect(screen.getByText(`No ${payload.state.roster.starters[0]!.player!.position} file`).classList.contains("muted")).toBe(true);
  });
});
