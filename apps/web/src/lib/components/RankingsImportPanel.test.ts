import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import RankingsImportPanel from "./RankingsImportPanel.svelte";

function setup(primaryStep: "rankings" | "projections" | "adp" | "assistant" | null = null) {
  const onImportSeasonProjections = vi.fn();
  const { container } = render(RankingsImportPanel, {
    hasDraft: true, scoring: "PPR", season: "2026", expanded: true, primaryStep,
    rankingImportSummary: null, seasonProjectionImportSummary: null, adpImportSummary: null,
    rankingImportError: "", seasonProjectionImportError: "", adpImportError: "",
    isImportingRankings: false, isClearingRankings: false,
    isImportingSeasonProjections: false, isClearingSeasonProjections: false,
    isImportingAdp: false, isClearingAdp: false,
    onImportRankings: vi.fn(), onImportSeasonProjections, onImportAdp: vi.fn(),
    onClearRankings: vi.fn(), onClearSeasonProjections: vi.fn(), onClearAdp: vi.fn(),
    onOpenRankings: vi.fn(), onOpenSeasonProjections: vi.fn(), onOpenAdp: vi.fn(),
  });
  const input = container.querySelector('input[type="file"][multiple]');
  if (!(input instanceof HTMLInputElement)) throw new Error("Season projection picker is missing");
  return { input, container, onImportSeasonProjections };
}

it.each([
  ["rankings", ["Upload CSV for ECR rankings"]],
  ["projections", ["Upload files for season projections"]],
  ["adp", ["Upload CSV for Sleeper ADP"]],
  ["assistant", []],
  [null, []],
] as const)("marks only the %s upload as the primary action", (step, primaries) => {
  const { container } = setup(step);
  const primary = [...container.querySelectorAll("label.btn-primary input")].map((input) => input.getAttribute("aria-label"));
  expect(primary).toEqual(primaries);
});

const exports = [
  ["QB", "Player,Team,BYE,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS"],
  ["RB", "Player,Team,BYE,ATT,YDS,TDS,REC,YDS,TDS,FL,FPTS"],
  ["WR", "Player,Team,BYE,REC,YDS,TDS,ATT,YDS,TDS,FL,FPTS"],
  ["TE", "Player,Team,BYE,REC,YDS,TDS,FL,FPTS"],
  ["K", "Player,Team,BYE,FG,FGA,XPT,FPTS\nBrandon Aubrey,DAL,14,34.8,39.5,47.0,151.4"],
  ["DST", "Player,Team,BYE,SACK,INT,FR,FF,TD,SAFETY,PA,YDS_AGN,FPTS"],
];

it("lists and imports all six season files with duplicate-download suffixes", async () => {
  const { input, container, onImportSeasonProjections } = setup();
  await fireEvent.change(input, {
    target: { files: exports.map(([position, csv]) => ({
      name: `FantasyPros_Fantasy_Football_Projections_${position} (4).csv`, text: async () => csv,
    })) },
  });
  await waitFor(() => expect(onImportSeasonProjections).toHaveBeenCalledOnce());
  expect(Array.from(container.querySelectorAll(".position-list span"), (item) => item.textContent))
    .toEqual(["QB", "RB", "WR", "TE", "K", "DEF"]);
  expect(onImportSeasonProjections).toHaveBeenCalledWith({
    season: "2026", files: exports.map(([position, csvText]) => ({ position: position === "DST" ? "DEF" : position, csvText })),
  });
  expect(screen.queryByText(/One or more files could not be identified/)).toBeNull();
});

it("rejects duplicate positions without importing the selection", async () => {
  const { input, onImportSeasonProjections } = setup();
  await fireEvent.change(input, { target: { files: ["FantasyPros_QB.csv", "FantasyPros_QB (4).csv"].map((name) => ({
    name, text: async () => "Player,Team,FPTS",
  })) } });
  await screen.findByText("Select only one FantasyPros projection file per position.");
  expect(onImportSeasonProjections).not.toHaveBeenCalled();
});
