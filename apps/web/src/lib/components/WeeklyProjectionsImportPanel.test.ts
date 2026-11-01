import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import WeeklyProjectionsImportPanel from "./WeeklyProjectionsImportPanel.svelte";

function setup(error = "") {
  const onImport = vi.fn();
  render(WeeklyProjectionsImportPanel, {
    hasTeam: true, open: true, defaultSeason: "2026", defaultWeek: 2, shownWeek: 2, leagueSeason: "2026", loadedFiles: 0, neededFiles: 6,
    summary: null, error, isImporting: false, isClearing: false,
    onImport, onLoadContext: vi.fn(), onClear: vi.fn(), onOpenFantasyPros: vi.fn(),
  });
  return onImport;
}

async function select(...names: string[]) {
  await fireEvent.change(screen.getByLabelText("Projection CSV"), {
    target: { files: names.map((name) => ({ name, text: async () => `contents of ${name}` })) },
  });
}

it("uses the selected position for an unrecognized single filename without calling it FLEX", async () => {
  const onImport = setup();
  await select("validation-only-invalid.csv");
  await screen.findByText("validation-only-invalid.csv");
  expect(screen.queryByText(/Ignored/)).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Import QB" }));
  expect(onImport).toHaveBeenCalledWith({ season: "2026", week: 2,
    files: [{ position: "QB", csvText: "contents of validation-only-invalid.csv" }] });
});

it("distinguishes unknown batch filenames from redundant FLEX exports", async () => {
  setup();
  await select("FantasyPros_QB.csv", "unknown.csv", "FantasyPros_FLEX.csv");
  await screen.findByText(/Could not identify a position for unknown.csv/);
  expect(screen.getByText(/Ignored FantasyPros_FLEX.csv/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Import QB" })).toBeTruthy();
});

it.each([
  "FantasyPros_FLEX.csv",
  "FantasyPros_FLX.csv",
  "FantasyPros_Fantasy_Football_Projections_FLEX(4).csv",
  "FantasyPros_Fantasy_Football_Projections_FLX(4).csv",
])("does not import a lone %s export as QB", async (name) => {
  setup();
  await select(name);
  await screen.findByText(/Ignored/);
  expect((screen.getByRole("button", { name: "Import QB" }) as HTMLButtonElement).disabled).toBe(true);
});

it("clears the previous error when replacement files are selected", async () => {
  setup("Unsupported projection header.");
  await select("FantasyPros_QB.csv", "FantasyPros_TE.csv");
  await screen.findByRole("button", { name: "Import 2 files" });
  expect(screen.queryByText("Unsupported projection header.")).toBeNull();
});

it("pasting replaces selected files and clears the previous error", async () => {
  const onImport = setup("Unsupported projection header.");
  await select("FantasyPros_TE.csv");
  await screen.findByRole("button", { name: "Import TE" });
  await fireEvent.input(screen.getByLabelText("CSV for the selected position"), { target: { value: "replacement CSV" } });
  expect(screen.getByText("Using pasted CSV")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Unsupported projection header.")).toBeNull());
  await fireEvent.click(screen.getByRole("button", { name: "Import QB" }));
  expect(onImport.mock.calls[0]?.[0].files).toEqual([{ position: "QB", csvText: "replacement CSV" }]);
});

it("does not restore an older file selection after a newer one finishes", async () => {
  const onImport = setup();
  let resolveFile: (text: string) => void = () => undefined;
  await fireEvent.change(screen.getByLabelText("Projection CSV"), {
    target: { files: [{ name: "FantasyPros_TE.csv", text: () => new Promise<string>((resolve) => { resolveFile = resolve; }) }] },
  });
  await select("FantasyPros_QB.csv");
  await screen.findByRole("button", { name: "Import QB" });
  resolveFile("old TE data");
  await fireEvent.click(screen.getByRole("button", { name: "Import QB" }));
  expect(onImport.mock.calls[0]?.[0].files).toEqual([{ position: "QB", csvText: "contents of FantasyPros_QB.csv" }]);
});

it("reports file-read failure without retaining old files or exposing system errors", async () => {
  setup();
  await select("FantasyPros_TE.csv");
  await screen.findByRole("button", { name: "Import TE" });
  await fireEvent.change(screen.getByLabelText("Projection CSV"), {
    target: { files: [{ name: "FantasyPros_QB.csv", text: async () => { throw new Error("private filesystem path"); } }] },
  });
  await screen.findByText("Could not read the selected files. Select them again or paste the CSV.");
  expect(screen.queryByText(/private filesystem/)).toBeNull();
  expect((screen.getByRole("button", { name: "Import QB" }) as HTMLButtonElement).disabled).toBe(true);
});

it.each([
  ["FantasyPros_K(4).csv", "K"],
  ["FantasyPros_DST (2).csv", "DEF"],
  ["FantasyPros_DEF.csv", "DEF"],
  ["renamed.csv", "K"],
])("uses the shared detector for %s", async (name, position) => {
  const onImport = setup();
  const csvText = position === "DEF"
    ? "Player,Team,SACK,INT,FR,FF,TD,SAFETY,PA,YDS_AGN,FPTS\nExample Defense,DAL,3,1,1,1,0,0,20,300,8"
    : "Player,Team,FG,FGA,XPT,FPTS\nExample Kicker,DAL,2,3,3,9";
  await fireEvent.change(screen.getByLabelText("Projection CSV"), {
    target: { files: [{ name, text: async () => csvText }] },
  });
  const label = position === "DEF" ? "DST" : position;
  await screen.findByRole("button", { name: `Import ${label}` });
  await fireEvent.click(screen.getByRole("button", { name: `Import ${label}` }));
  expect(onImport).toHaveBeenCalledWith({ season: "2026", week: 2, files: [{ position, csvText }] });
});

it("styles only positions with matched players as loaded", () => {
  const { container } = render(WeeklyProjectionsImportPanel, {
    hasTeam: true, open: true, defaultSeason: "2026", defaultWeek: 2, shownWeek: 2, leagueSeason: "2026", loadedFiles: 1, neededFiles: 6,
    summary: {
      season: "2026", week: 2, position: "QB", positions: ["QB", "K"], importedAt: "2026-09-01T00:00:00.000Z",
      rowsParsed: 8, matched: 7, unmatched: 1, ambiguous: 0, conflicts: 0, unmatchedSample: [],
      positionResults: [
        { position: "QB", rowsParsed: 7, matched: 7, unmatched: 0, ambiguous: 0 },
        { position: "K", rowsParsed: 1, matched: 0, unmatched: 1, ambiguous: 0 },
      ],
    } as never,
    error: "", isImporting: false, isClearing: false,
    onImport: vi.fn(), onLoadContext: vi.fn(), onClear: vi.fn(), onOpenFantasyPros: vi.fn(),
  });
  const chip = (label: string) => Array.from(container.querySelectorAll(".position-status > span")).find((node) => node.textContent?.trim().startsWith(label));
  expect(chip("QB")?.classList.contains("loaded")).toBe(true);
  expect(chip("K")?.classList.contains("loaded")).toBe(false);
});

it("clears the week it reports, even when a different week is typed", async () => {
  const onClear = vi.fn();
  render(WeeklyProjectionsImportPanel, {
    hasTeam: true, open: true, defaultSeason: "2026", defaultWeek: 7, shownWeek: 7, leagueSeason: "2026", loadedFiles: 1, neededFiles: 6,
    summary: {
      source: "fantasypros", season: "2026", week: 7, position: "QB", positions: ["QB"], rowsParsed: 1, matched: 1,
      positionResults: [{ position: "QB", rowsParsed: 1, matched: 1, unmatched: 0, ambiguous: 0, appliedAt: new Date().toISOString() }],
      unmatched: [], ambiguous: [], appliedAt: new Date().toISOString(),
    },
    error: "", isImporting: false, isClearing: false,
    onImport: vi.fn(), onLoadContext: vi.fn(), onClear, onOpenFantasyPros: vi.fn(),
  });
  await fireEvent.input(screen.getByLabelText("Week"), { target: { value: "8" } });
  expect(screen.getByText("Week 7 is on screen. Load selected week to switch, or import files into Week 8.")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Clear week" }));
  expect(onClear).toHaveBeenCalledWith({ season: "2026", week: 7 });
});
