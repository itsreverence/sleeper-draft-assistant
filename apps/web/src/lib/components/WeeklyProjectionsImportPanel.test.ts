import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import WeeklyProjectionsImportPanel from "./WeeklyProjectionsImportPanel.svelte";

function setup(error = "") {
  const onImport = vi.fn();
  render(WeeklyProjectionsImportPanel, {
    hasTeam: true, defaultSeason: "2026", defaultWeek: 2, leagueSeason: "2026", currentWeek: 2,
    summary: null, rosLoaded: false, error, isImporting: false, isClearing: false,
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

it.each(["FLEX", "FLX"])("does not import a lone %s export as QB", async (position) => {
  setup();
  await select(`FantasyPros_${position}.csv`);
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
