import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type { WeeklyProjectionImportSummary } from "../types";

import MyTeamPanel from "./MyTeamPanel.svelte";
import { createTeamPayloadFixture } from "../testing/draft-fixtures";

describe("Team Manager season state", () => {
  it("labels a preseason roster without presenting a regular-season week", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, {
      state: { ...payload.state, seasonPhase: "preseason", week: null },
    });

    expect(screen.getByText("Preseason · PPR · 1 player")).toBeTruthy();
    expect(screen.queryByText("Week 1")).toBeNull();
  });

  it("keeps format and roster size in the compact team heading", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, { state: payload.state });

    expect(screen.getByText("Week 1 · PPR · 1 player")).toBeTruthy();
  });

  it("labels a pinned week separately from Sleeper's active week", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, {
      state: { ...payload.state, week: 2 },
      selectedWeek: 1,
      weekContext: {
        week: 1,
        matchupId: 1,
        status: "scheduled",
        userRosterId: "roster-1",
        opponentRosterId: "roster-2",
        userTeamName: "My Team",
        opponentTeamName: "Week One Opponent",
        userPoints: null,
        opponentPoints: null,
        userStarters: [],
        opponentStarters: [],
        facts: [],
        limitations: [],
        updatedAt: "2026-08-30T00:00:00.000Z",
      },
    });

    expect(screen.getByText("Week 1 vs Week One Opponent · Active Week 2 · PPR · 1 player")).toBeTruthy();
    expect(screen.queryByText(/Week 2 vs Week One Opponent/)).toBeNull();
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

    expect(screen.getByText("Preseason · PPR · 1 player")).toBeTruthy();
    expect(screen.getByText("Data: 0/2 sources")).toBeTruthy();
    expect(screen.queryByText(/Week 1/)).toBeNull();
    expect(screen.queryByText(/confidence/i)).toBeNull();
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

    expect(screen.queryByText("Projection")).toBeNull();

    await view.rerender({
      state: payload.state,
      readiness: { ...payload.dataReadiness, projectedRosterPlayers: 1 },
    });

    expect(screen.getByText("Projection")).toBeTruthy();
    expect(screen.getByText("Not matched")).toBeTruthy();
  });
});
