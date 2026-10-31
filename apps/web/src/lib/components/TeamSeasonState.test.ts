import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type { Player, WeeklyProjectionImportSummary } from "../types";

import MyTeamPanel from "./MyTeamPanel.svelte";
import { createTeamPayloadFixture } from "../testing/draft-fixtures";

const schedule = (onBye: boolean | null, opponent: string | null = null) => ({ season: "2026", week: 1, source: "sleeper" as const, onBye, opponent, homeAway: opponent ? "away" as const : null, gameStatus: null });
const sleeperStatus = (overrides: Partial<NonNullable<Player["sleeperStatus"]>> = {}) => ({ rosterStatus: "Active", injuryStatus: null, injuryStartDate: null, practiceParticipation: null, depthChartPosition: null, depthChartOrder: null, newsUpdatedAt: null, ...overrides });

describe("Team Manager lineup", () => {
  it("keeps an imported zero-match file truthful in the attention box and the row", () => {
    const payload = createTeamPayloadFixture();
    const summary: WeeklyProjectionImportSummary = {
      source: "fantasypros", season: "2026", week: 1, position: "QB", positions: ["QB"],
      positionResults: [{ position: "QB", matched: 0, rowsParsed: 1, unmatched: 1, ambiguous: 0, appliedAt: new Date().toISOString() }],
      matched: 0, rowsParsed: 1, unmatched: [], ambiguous: [], appliedAt: new Date().toISOString(),
    };
    const onManageData = vi.fn();
    payload.state.roster.starters[0]!.player!.schedule = schedule(false, "KC");
    render(MyTeamPanel, {
      state: payload.state, weeklySummary: summary, onManageData,
      readiness: { ...payload.dataReadiness, status: "partial", confidence: "medium", loadedPositions: [], missingPositions: ["QB"], projectedRosterPlayers: 1 },
    });
    expect(screen.getByText("No match")).toBeTruthy();
    expect(screen.queryByText("No QB file")).toBeNull();
    screen.getByRole("button", { name: "QB projections matched no players" }).click();
    expect(onManageData).toHaveBeenCalledWith("weekly-files");
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

  it("shows an accessible bye marker and a dash rather than a projection", () => {
    const payload = createTeamPayloadFixture();
    payload.state.roster.starters[0]!.player!.schedule = schedule(true);
    render(MyTeamPanel, { state: payload.state, readiness: { ...payload.dataReadiness, projectedRosterPlayers: 1 } });
    expect(screen.getByRole("img", { name: "On bye in Week 1" }).textContent).toBe("BYE");
    expect(screen.getByRole("button", { name: "Team Quarterback is on bye" })).toBeTruthy();
    expect(screen.queryByText(/No QB file/)).toBeNull();
  });

  it("gives team, week, and a clear player's empty status their own cells", () => {
    const payload = createTeamPayloadFixture();
    const player = payload.state.roster.starters[0]!.player!;
    player.sleeperStatus = undefined;
    player.schedule = schedule(false, "JAX");
    render(MyTeamPanel, { state: payload.state });
    const row = screen.getByRole("row", { name: new RegExp(player.name) });
    const cells = within(row).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent?.trim())).toEqual(["QB", "@ JAX", ""]);
    expect(within(row).getByRole("rowheader").textContent).toContain(player.team);
    expect(row.classList.contains("flagged")).toBe(false);
  });

  it("labels a preseason roster without presenting a regular-season week or clearing it", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, { state: { ...payload.state, seasonPhase: "preseason", week: null } });
    expect(screen.getByRole("columnheader", { name: "Week" })).toBeTruthy();
    expect(screen.getByText("Preseason. Weekly lineup checks start with Week 1.")).toBeTruthy();
    expect(screen.queryByText("Lineup looks set")).toBeNull();
    expect(screen.queryByText(/need a look|needs a look/)).toBeNull();
  });

  it("names the table and columns, and collapses reserves behind one row until asked", async () => {
    const payload = createTeamPayloadFixture();
    const starter = payload.state.roster.starters[0]!.player!;
    payload.state.roster.bench = [{ ...starter, id: "bench-player", sleeperId: "bench-player", name: "Bench Player" }];
    payload.state.roster.injuredReserve = [{ ...starter, id: "ir-player", sleeperId: "ir-player", name: "IR Player", sleeperStatus: sleeperStatus({ rosterStatus: "Injured Reserve", injuryStatus: "Out" }) }];
    payload.state.roster.taxi = [];
    render(MyTeamPanel, { state: payload.state, readiness: { ...payload.dataReadiness, projectedRosterPlayers: 1 } });

    expect(screen.getByRole("table", { name: "Starting lineup and reserves" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Slot", "Player", "Week 1", "Proj", "Status"]);
    expect(screen.queryByText("Bench Player")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Bench (1) · Injured reserve (1)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Bench Player")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Bench" }).getAttribute("scope")).toBe("rowgroup");
    expect(screen.getByRole("rowheader", { name: "Injured reserve" }).getAttribute("scope")).toBe("rowgroup");
    expect(screen.getAllByText("Out · Injured Reserve").length).toBeGreaterThan(0);
    expect(screen.getByTitle(/roster: Injured Reserve/)).toBeTruthy();

    await fireEvent.click(toggle);
    expect(screen.queryByText("Bench Player")).toBeNull();
  });

  it("tints only flagged starters and offers Ask there, never on the bench", async () => {
    const payload = createTeamPayloadFixture();
    const starter = payload.state.roster.starters[0]!.player!;
    const flagged = { ...starter, schedule: schedule(false, "KC"), sleeperStatus: sleeperStatus({ injuryStatus: "Questionable" }) };
    payload.state.roster.starters = [{ slot: "QB", eligiblePositions: ["QB"], player: flagged }];
    payload.state.roster.bench = [{ ...flagged, id: "bench", sleeperId: "bench", name: "Hurt Bench" }];
    const onAsk = vi.fn();
    render(MyTeamPanel, { state: payload.state, canAsk: true, onAsk });

    await fireEvent.click(screen.getByRole("button", { name: /Bench \(1\)/ }));
    const [ask] = screen.getAllByRole("button", { name: "Ask about Team Quarterback" });
    await fireEvent.click(ask!);
    expect(onAsk).toHaveBeenCalledWith("Sleeper lists Team Quarterback as Questionable. Should I change anything at QB?");
    expect(screen.queryByRole("button", { name: "Ask about Hurt Bench" })).toBeNull();
    expect(screen.getByRole("row", { name: /Team Quarterback/ }).classList.contains("flagged")).toBe(true);
    expect(screen.getByRole("row", { name: /Hurt Bench/ }).classList.contains("flagged")).toBe(false);
  });

  it("hides Ask when the Assistant cannot take the question", () => {
    const payload = createTeamPayloadFixture();
    payload.state.roster.starters[0]!.player!.sleeperStatus = sleeperStatus({ injuryStatus: "Out" });
    render(MyTeamPanel, { state: payload.state, canAsk: false });
    expect(screen.queryByRole("button", { name: /^Ask about/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Team Quarterback is listed Out" })).toBeTruthy();
  });

  it("moves focus to the flagged row and keeps a heading count equal to the items", async () => {
    const payload = createTeamPayloadFixture();
    payload.state.roster.starters[0]!.player!.schedule = schedule(true);
    payload.state.roster.starters.push({ slot: "RB", eligiblePositions: ["RB"], player: null });
    render(MyTeamPanel, { state: payload.state });

    const list = screen.getByRole("list", { name: "2 things need a look" });
    expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual(["Team Quarterback is on bye", "RB slot is empty"]);
    await fireEvent.click(within(list).getByRole("button", { name: "RB slot is empty" }));
    expect(document.activeElement).toBe(screen.getByRole("row", { name: /Open slot/ }));
  });

  it("uses amber text for questionable, red text for out, and On bye only without an injury", () => {
    const payload = createTeamPayloadFixture();
    const starter = payload.state.roster.starters[0]!.player!;
    const withStatus = (name: string, injuryStatus: string, onBye: boolean) => ({ ...starter, id: name, sleeperId: name, name, sleeperStatus: sleeperStatus({ injuryStatus: injuryStatus || null }), schedule: schedule(onBye) });
    payload.state.roster.starters = ["Hurt:Questionable:", "Gone:Out:", "Resting::bye", "Hurt On Bye:Doubtful:bye"].map((entry) => {
      const [name, injury, bye] = entry.split(":");
      return { slot: "RB", eligiblePositions: ["RB"], player: withStatus(name!, injury!, bye === "bye") };
    });
    render(MyTeamPanel, { state: payload.state });

    expect(screen.getAllByText("Questionable")[0]!.classList.contains("tone-warning")).toBe(true);
    expect(screen.getAllByText("Out")[0]!.classList.contains("tone-danger")).toBe(true);
    const onBye = screen.getAllByText("On bye")[0]!;
    expect(onBye.classList.contains("tone-warning")).toBe(true);
    expect(onBye.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByText("Doubtful").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Out")[0]!.getAttribute("aria-hidden")).toBeNull();
  });

  it("shows Sleeper injury, practice, and depth-chart status on roster rows", () => {
    const payload = createTeamPayloadFixture();
    payload.state.roster.starters[0]!.player!.sleeperStatus = sleeperStatus({
      injuryStatus: "Questionable", injuryStartDate: "2026-08-24", practiceParticipation: "Limited",
      depthChartPosition: "QB", depthChartOrder: 1, newsUpdatedAt: "2026-08-29T12:00:00.000Z",
    });
    render(MyTeamPanel, { state: payload.state });
    expect(screen.getAllByText("Questionable · Limited").length).toBeGreaterThan(0);
    expect(screen.getByTitle(/QB1/)).toBeTruthy();
  });

  it("drops the coverage and confidence pair from the lineup", () => {
    const payload = createTeamPayloadFixture();
    render(MyTeamPanel, {
      state: payload.state,
      readiness: { ...payload.dataReadiness, status: "limited", confidence: "low", projectedRosterPlayers: 0, eligibleRosterPlayers: 0 },
      onManageData: () => undefined,
    });
    expect(screen.queryByText(/confidence/i)).toBeNull();
    expect(screen.queryByText(/coverage/i)).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("only shows projections when weekly roster coverage exists", async () => {
    const payload = createTeamPayloadFixture();
    const view = render(MyTeamPanel, { state: payload.state, readiness: { ...payload.dataReadiness, projectedRosterPlayers: 0 } });
    expect(screen.queryByText("Proj")).toBeNull();
    await view.rerender({ state: payload.state, readiness: { ...payload.dataReadiness, projectedRosterPlayers: 1 } });
    expect(screen.getByText("Proj")).toBeTruthy();
    expect(screen.getByText(`No ${payload.state.roster.starters[0]!.player!.position} file`)).toBeTruthy();
  });
});
