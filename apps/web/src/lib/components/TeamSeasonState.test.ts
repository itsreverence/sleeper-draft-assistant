import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import MyTeamPanel from "./MyTeamPanel.svelte";
import TeamWorkspaceStatus from "./TeamWorkspaceStatus.svelte";
import { createTeamPayloadFixture } from "../testing/draft-fixtures";

describe("Team Manager season state", () => {
  it("labels a preseason roster without presenting a regular-season week", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, {
      state: { ...payload.state, seasonPhase: "preseason", week: null },
    });

    expect(screen.getByText("Preseason")).toBeTruthy();
    expect(screen.queryByText("Week 1")).toBeNull();
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

  it("keeps matchup and weekly readiness inactive during preseason", () => {
    const payload = createTeamPayloadFixture();
    render(TeamWorkspaceStatus, {
      state: { ...payload.state, seasonPhase: "preseason", week: null },
      readiness: payload.dataReadiness,
      weekContext: null,
      rosSummary: null,
      weeklySummary: null,
      onManageData: () => undefined,
    });

    expect(screen.getByText("Preseason")).toBeTruthy();
    expect(screen.getByText("Roster planning")).toBeTruthy();
    expect(screen.getByText("Starts Week 1")).toBeTruthy();
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it("opens team data management from the compact status strip", async () => {
    const payload = createTeamPayloadFixture();
    let opened = false;
    render(TeamWorkspaceStatus, {
      state: payload.state,
      readiness: payload.dataReadiness,
      weekContext: null,
      rosSummary: null,
      weeklySummary: null,
      onManageData: () => (opened = true),
    });

    screen.getByRole("button", { name: "Manage data" }).click();
    expect(opened).toBe(true);
  });
});
