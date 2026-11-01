import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

import { createTeamPayloadFixture } from "../testing/draft-fixtures";
import type { Position, TeamManagerState, WeeklyProjectionImportSummary } from "../types";
import TeamDataDrawer from "./TeamDataDrawer.svelte";

const ALL: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

function summaryOf(positions: Position[], week = 9): WeeklyProjectionImportSummary {
  const appliedAt = new Date().toISOString();
  return {
    source: "fantasypros", season: "2026", week, position: null, positions,
    positionResults: positions.map((position) => ({ position, rowsParsed: 30, matched: 28, unmatched: 2, ambiguous: 0, appliedAt })),
    rowsParsed: positions.length * 30, matched: positions.length * 28,
    unmatched: [{ row: 4, name: "Synthetic Unmatched", team: "BUF", position: "QB" }],
    ambiguous: [{ row: 5, name: "Synthetic Ambiguous", team: null, position: "RB", candidates: [] }],
    appliedAt,
  } as WeeklyProjectionImportSummary;
}

function setup(options: { summary?: WeeklyProjectionImportSummary | null; section?: "readiness" | "weekly-files" | "weekly-week" | null; phase?: TeamManagerState["seasonPhase"]; status?: "ready" | "partial" | "limited"; selectedWeek?: number | null; rosError?: string; warnings?: string[] } = {}) {
  const { summary = null, section = null, phase = "regular", status = "ready", selectedWeek = null, rosError = "", warnings = [] } = options;
  const payload = createTeamPayloadFixture();
  const loaded = summary?.positions ?? [];
  const handlers = {
    onImportRos: vi.fn(), onClearRos: vi.fn(), onOpenRos: vi.fn(), onOpenDraftRankings: vi.fn(),
    onImportWeekly: vi.fn(), onLoadWeek: vi.fn(), onClearWeekly: vi.fn(), onOpenWeekly: vi.fn(), onClose: vi.fn(),
  };
  render(TeamDataDrawer, {
    section,
    teamState: { ...payload.state, seasonPhase: phase, week: 9, league: { ...payload.state.league, season: "2026" } },
    readiness: {
      ...payload.dataReadiness, status, confidence: status === "ready" ? "high" : "low", headline: "Weekly evidence is ready for the Assistant.",
      relevantPositions: ALL, loadedPositions: loaded, missingPositions: ALL.filter((position) => !loaded.includes(position)),
      importMatchRate: summary ? 0.93 : null, rosterProjectionCoverage: 0.75, projectedRosterPlayers: 9, eligibleRosterPlayers: 12, warnings,
    },
    weeklySummary: summary, rosSummary: null, selectedWeek,
    defaultSeason: "2026", defaultWeek: selectedWeek ?? 9, scoring: "PPR", rosError, weeklyError: "",
    isImportingRos: false, isClearingRos: false, isImportingWeekly: false, isClearingWeekly: false,
    ...handlers,
  });
  return { handlers, dialog: screen.getByRole("dialog", { name: "Manage team data" }) };
}

const settle = async () => { await tick(); await Promise.resolve(); await tick(); };
const line = (name: string) => screen.getByRole("region", { name, hidden: true });
const lineToggle = (name: string) => within(line(name)).getByRole("button", { name: new RegExp(`^${name}`) });

describe("Manage data drawer", () => {
  it("collapses everything below the lead, and each line opens and closes on demand", async () => {
    setup();
    for (const name of ["Weekly projections", "Season value rankings", "Coverage"]) {
      expect(lineToggle(name).getAttribute("aria-expanded")).toBe("false");
    }
    expect(screen.queryByRole("button", { name: "Load selected week" })).toBeNull();
    await fireEvent.click(lineToggle("Weekly projections"));
    expect(screen.getByRole("button", { name: "Load selected week" })).toBeTruthy();
    await fireEvent.click(lineToggle("Weekly projections"));
    expect(screen.queryByRole("button", { name: "Load selected week" })).toBeNull();
  });

  it.each([
    [null, () => within(screen.getByRole("dialog", { name: "Manage team data" })).getByRole("button", { name: "Close team data" })],
    ["weekly-files", () => screen.getByLabelText("Choose CSV files", { selector: ".lead input" })],
    ["weekly-week", () => screen.getByLabelText("Week")],
    ["readiness", () => lineToggle("Coverage")],
  ] as const)("section %s opens and focuses its control", async (section, control) => {
    setup({ section });
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(control()));
    if (section === "readiness") expect(screen.getByRole("meter", { name: "Roster projection coverage" })).toBeTruthy();
    if (section === "weekly-week") expect(lineToggle("Weekly projections").getAttribute("aria-expanded")).toBe("true");
  });

  it("weekly-files lands inside the line when the lead has no file control", async () => {
    setup({ section: "weekly-files", summary: summaryOf(ALL) });
    await settle();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Projection CSV")));
    expect(lineToggle("Weekly projections").getAttribute("aria-expanded")).toBe("true");
  });

  it("imports lead files into the week the lead states, not a typed week", async () => {
    const { handlers } = setup({ summary: summaryOf(["QB", "RB", "WR", "TE"]) });
    await fireEvent.click(lineToggle("Weekly projections"));
    await fireEvent.input(screen.getByLabelText("Week"), { target: { value: "12" } });
    await fireEvent.change(screen.getByLabelText("Choose K and DST files"), {
      target: { files: [{ name: "FantasyPros_K.csv", text: async () => "k" }, { name: "FantasyPros_DST.csv", text: async () => "dst" }] },
    });
    await fireEvent.click(await screen.findByRole("button", { name: "Import 2 files" }));
    expect(handlers.onImportWeekly).toHaveBeenCalledWith({
      season: "2026", week: 9,
      files: [{ position: "K", csvText: "k" }, { position: "DEF", csvText: "dst" }],
    });
    expect(screen.getByLabelText("Choose different files")).toBeTruthy();
  });

  it("only ever shows one enabled primary action in the lead", async () => {
    setup({ summary: summaryOf(["QB"]) });
    const lead = screen.getByRole("region", { name: /is missing/ });
    expect(lead.querySelectorAll(".btn-primary")).toHaveLength(1);
    await fireEvent.change(within(lead).getByLabelText(/^Choose .* files$/), { target: { files: [{ name: "FantasyPros_K.csv", text: async () => "k" }] } });
    await within(lead).findByRole("button", { name: "Import K" });
    expect(lead.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("all loaded has no primary button in the lead", () => {
    setup({ summary: summaryOf(ALL) });
    const lead = screen.getByRole("region", { name: "Week 9 projections are loaded" });
    expect(lead.querySelector(".btn-primary")).toBeNull();
    expect(within(lead).getByRole("button", { name: "Change week" })).toBeTruthy();
  });

  it("source links open the missing position for the stated week", async () => {
    const { handlers } = setup({ summary: summaryOf(["QB", "RB", "WR", "TE"]) });
    await fireEvent.click(screen.getByRole("button", { name: "FantasyPros DST" }));
    expect(handlers.onOpenWeekly).toHaveBeenCalledWith("DEF", 9);
  });

  it("Change week opens the line and focuses the week field", async () => {
    setup({ summary: summaryOf(ALL) });
    await fireEvent.click(screen.getByRole("button", { name: "Change week" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Week")));
  });

  it("Back to Week returns to Sleeper's week", async () => {
    const { handlers } = setup({ summary: summaryOf(ALL, 7), selectedWeek: 7 });
    await fireEvent.click(screen.getByRole("button", { name: "Back to Week 9" }));
    expect(handlers.onLoadWeek).toHaveBeenCalledWith({ season: "2026", week: 9 });
  });

  it("preseason leads with season value rankings and has no coverage line", () => {
    setup({ phase: "preseason" });
    const names = screen.getAllByRole("region").map((region) => region.getAttribute("aria-labelledby") && region.textContent);
    expect(screen.queryByRole("region", { name: "Coverage" })).toBeNull();
    expect(names.join(" ").indexOf("Season value rankings")).toBeLessThan(names.join(" ").indexOf("Weekly projections"));
  });

  it("a saved season value error opens its line on return", () => {
    setup({ summary: summaryOf(ALL), rosError: "Synthetic failure." });
    expect(lineToggle("Season value rankings").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Synthetic failure.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /^Week 9 projections are loaded$/ })?.querySelector(".dot")).toBeNull();
  });

  it("keeps every capability reachable", async () => {
    const warning = "NFL schedule unavailable; imported draft byes are used where known, otherwise bye status is unknown.";
    setup({ summary: summaryOf(ALL), warnings: [warning] });
    for (const name of ["Weekly projections", "Season value rankings", "Coverage"]) await fireEvent.click(lineToggle(name));
    const weekly = within(line("Weekly projections"));
    for (const label of ["Season", "Week", "Position file", "Projection CSV", "CSV for the selected position"]) expect(weekly.getByLabelText(label, { selector: "input,select,textarea" })).toBeTruthy();
    for (const name of ["Load selected week", "Open FantasyPros", "Clear week", "Import QB"]) expect(weekly.getByRole("button", { name })).toBeTruthy();
    for (const text of ["Unmatched rows", "Ambiguous rows", "Paste CSV instead", /^Active import: FantasyPros/, /provider-scored/]) expect(weekly.getByText(text)).toBeTruthy();
    const ranks = within(line("Season value rankings"));
    for (const label of ["Season", "Choose CSV"]) expect(ranks.getByLabelText(label)).toBeTruthy();
    for (const name of ["Open ROS ECR", "Open Draft ECR", "Import season value rankings"]) expect(ranks.getByRole("button", { name })).toBeTruthy();
    expect(ranks.getByText("PPR")).toBeTruthy();
    const coverage = within(line("Coverage"));
    for (const text of ["Roster coverage", "Import matching", warning, /active roster players projected/]) expect(coverage.getByText(text)).toBeTruthy();
    expect(coverage.getByRole("meter", { name: "Roster projection coverage" })).toBeTruthy();
    expect(coverage.queryByText(/provider-scored/)).toBeNull();
  });
});
