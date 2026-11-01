import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdpImportSummary, AppSettings, RankingImportSummary, SeasonProjectionImportSummary } from "../types";
import DraftPreparationChecklist from "./DraftPreparationChecklist.svelte";

const now = new Date("2026-08-20T12:00:00.000Z");
const recent = "2026-08-19T12:00:00.000Z";
const old = "2026-08-01T12:00:00.000Z";

const rankings = { source: "fantasypros", rowsParsed: 312, matched: 312, unmatched: [], ambiguous: [], scoring: "PPR", appliedAt: recent } as unknown as RankingImportSummary;
const projections = {
  source: "fantasypros", season: "2026", scoring: "PPR", positions: ["QB", "RB", "WR", "TE", "K", "DEF"], rowsParsed: 600, matched: 548,
  unmatched: [], ambiguous: [], approximatePositions: [], warnings: [], appliedAt: recent,
} as unknown as SeasonProjectionImportSummary;
const adp = { source: "fantasypros", market: "Sleeper", season: "2026", rowsParsed: 286, matched: 286, unmatched: [], ambiguous: [], includesRealTime: true, appliedAt: recent } as unknown as AdpImportSummary;
const settings: AppSettings = {
  aiProvider: "codex-app-server", codexBin: "codex", codexModel: "gpt-5.6-terra", codexServiceTier: "fast", codexWebSearch: true,
  codexTimeoutMs: 60000, automaticAiAudit: "off", aiSetupAcknowledged: true,
} as AppSettings;
const assistantReady = { id: "codex-app-server", label: "Codex", configured: true, availability: "available" } as const;
const assistantOff = { id: "noop", label: "None", configured: false, availability: "disabled", detail: "No external AI provider is configured." } as const;
const assistantBroken = { id: "codex-app-server", label: "Codex", configured: false, availability: "unavailable", detail: "Codex could not start." } as const;

function props(overrides: Record<string, unknown> = {}) {
  const base = {
    rankingImportSummary: null as RankingImportSummary | null,
    seasonProjectionImportSummary: null as SeasonProjectionImportSummary | null,
    adpImportSummary: null as AdpImportSummary | null,
    providerStatus: assistantOff as typeof assistantOff | typeof assistantReady | typeof assistantBroken | null,
    ...overrides,
  };
  const staleRankings = base.rankingImportSummary?.appliedAt === old;
  return {
    statusLabel: "Pre-draft", scoring: "PPR", season: "2026", teamLabel: "Fixture Team · Slot 3",
    readiness: {
      hasRankings: Boolean(base.rankingImportSummary && base.rankingImportSummary.matched > 0),
      rankingsStale: staleRankings,
      hasProjections: Boolean(base.seasonProjectionImportSummary && base.seasonProjectionImportSummary.matched > 0),
      hasAdp: Boolean(base.adpImportSummary && base.adpImportSummary.matched > 0),
      aiConfigured: base.providerStatus?.availability === "available" && base.providerStatus.id === "codex-app-server",
    },
    rankingImportError: "", seasonProjectionImportError: "", adpImportError: "",
    isImportingRankings: false, isClearingRankings: false,
    isImportingSeasonProjections: false, isClearingSeasonProjections: false,
    isImportingAdp: false, isClearingAdp: false,
    settings, isSavingSettings: false, settingsError: "",
    onImportRankings: vi.fn(), onImportSeasonProjections: vi.fn(), onImportAdp: vi.fn(),
    onClearRankings: vi.fn(), onClearSeasonProjections: vi.fn(), onClearAdp: vi.fn(),
    onOpenRankings: vi.fn(), onOpenSeasonProjections: vi.fn(), onOpenAdp: vi.fn(),
    onSaveSettings: vi.fn(), onContinue: vi.fn(), onOpenEmergency: vi.fn(),
    ...base,
  };
}

const ready = { rankingImportSummary: rankings, seasonProjectionImportSummary: projections, adpImportSummary: adp, providerStatus: assistantReady };

function livePrimaries(container: HTMLElement) {
  return [...container.querySelectorAll(".btn-primary:not(:disabled, .is-disabled)")].map((element) => element.textContent?.trim());
}

function fileInputs(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="file"]')];
}

describe("DraftPreparationChecklist", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["nothing loaded", {}, "Upload PPR ECR CSV", "Four steps before the draft room"],
    ["rankings loaded", { rankingImportSummary: rankings }, "Upload 2026 projection files", "Three steps before the draft room"],
    ["rankings and projections loaded", { rankingImportSummary: rankings, seasonProjectionImportSummary: projections }, "Upload Sleeper ADP CSV", "Two steps before the draft room"],
    ["only the Assistant left", { ...ready, providerStatus: assistantOff }, "Confirm Assistant settings", "One step before the draft room"],
    ["stale rankings", { ...ready, rankingImportSummary: { ...rankings, appliedAt: old } }, "Replace PPR ECR CSV", "One step before the draft room"],
    ["everything ready", ready, "Enter draft room", "Ready for the draft room"],
  ])("names one next step with %s", (_name, overrides, primary, heading) => {
    const { container } = render(DraftPreparationChecklist, props(overrides));
    expect(livePrimaries(container)).toEqual([primary]);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(heading);
  });

  it.each([
    ["rankingImportSummary", rankings, "PPR ECR"],
    ["seasonProjectionImportSummary", projections, "2026 season projections"],
    ["adpImportSummary", adp, "Sleeper ADP"],
  ])("explains a zero-match %s and offers replacement and clear", (key, summary, title) => {
    render(DraftPreparationChecklist, props({ ...ready, [key]: { ...summary, matched: 0 } }));
    expect(screen.getByText(/No players matched/)).toBeTruthy();
    expect(screen.getByRole("button", { name: `Clear ${title}` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enter draft room" })).toBeNull();
  });

  it("shows the facts line under the heading", () => {
    render(DraftPreparationChecklist, props({ statusLabel: "Drafting", teamLabel: "Unmatched" }));
    const facts = screen.getByRole("heading", { level: 2 }).nextElementSibling?.textContent;
    expect(facts).toBe("Drafting · PPR · 2026 season · Your team: Unmatched");
  });

  it("collapses a done row to its facts and opens it for replace, clear and source", async () => {
    const { container } = render(DraftPreparationChecklist, props({ rankingImportSummary: rankings }));
    expect(screen.queryByRole("button", { name: "Clear PPR ECR" })).toBeNull();
    const head = screen.getByRole("button", { name: /PPR ECR/ });
    expect(head.textContent).toContain("312 matched · Aug 19");
    expect(head.getAttribute("aria-expanded")).toBe("false");

    await fireEvent.click(head);

    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Replace CSV for PPR ECR")).toBeTruthy();
    expect(screen.getByText(/^PPR · Imported .*\(1 day old\)$/)).toBeTruthy();
    expect(livePrimaries(container)).toEqual(["Upload 2026 projection files"]);
  });

  it("wires source link and clear in an open row", async () => {
    const onOpenRankings = vi.fn();
    const onClearRankings = vi.fn();
    render(DraftPreparationChecklist, props({ rankingImportSummary: rankings, onOpenRankings, onClearRankings }));
    await fireEvent.click(screen.getByRole("button", { name: /PPR ECR/ }));
    await fireEvent.click(screen.getByRole("button", { name: "View source for PPR ECR" }));
    await fireEvent.click(screen.getByRole("button", { name: "Clear PPR ECR" }));
    expect(onOpenRankings).toHaveBeenCalledOnce();
    expect(onClearRankings).toHaveBeenCalledOnce();
  });

  it("lets a later source upload ahead of its turn without a second primary", async () => {
    const onImportAdp = vi.fn();
    const { container } = render(DraftPreparationChecklist, props({ onImportAdp }));
    await fireEvent.click(screen.getByRole("button", { name: /Sleeper ADP/ }));
    expect(livePrimaries(container)).toEqual(["Upload PPR ECR CSV"]);

    await fireEvent.change(screen.getByLabelText("Upload CSV for Sleeper ADP"), {
      target: { files: [{ name: "adp.csv", text: async () => "csv" }] },
    });
    await waitFor(() => expect(onImportAdp).toHaveBeenCalledWith("csv", "2026"));
  });

  it("flags stale rankings as a step and old optional data without blocking it", () => {
    const { container } = render(DraftPreparationChecklist, props({
      ...ready,
      rankingImportSummary: { ...rankings, appliedAt: old },
      adpImportSummary: { ...adp, appliedAt: old },
    }));
    expect(screen.getByText("Out of date · Aug 1")).toBeTruthy();
    expect(screen.getByText(/Import a current ECR export before entering the draft room/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sleeper ADP/ }).textContent).toContain("286 matched · 19 days old");
    expect(livePrimaries(container)).toEqual(["Replace PPR ECR CSV"]);
  });

  it("keeps projection warnings on the collapsed row and in the open one", async () => {
    const warning = "7 rows had no Sleeper match and were skipped.";
    render(DraftPreparationChecklist, props({ rankingImportSummary: rankings, seasonProjectionImportSummary: { ...projections, warnings: [warning] } }));
    const head = screen.getByRole("button", { name: /season projections/ });
    expect(head.textContent).toContain("548 matched · Aug 19 · 1 warning");
    await fireEvent.click(head);
    expect(screen.getByText(warning)).toBeTruthy();
    expect(screen.getByLabelText("Projection positions").textContent?.replace(/\s/g, "")).toBe("QBRBWRTEKDEF");
  });

  it("pins a row open with its import error and marks it as an alert", () => {
    render(DraftPreparationChecklist, props({ adpImportError: "No ADP rows could be read from that CSV." }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("No ADP rows could be read from that CSV.");
    expect(screen.getByLabelText("Upload CSV for Sleeper ADP")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^3\s*Sleeper ADP/ })).toBeNull();
  });

  it("carries the importing state on the row and the button", () => {
    const { container } = render(DraftPreparationChecklist, props({ isImportingRankings: true }));
    expect(container.querySelector(".spinner")).toBeTruthy();
    expect(livePrimaries(container)).toEqual([]);
    expect(fileInputs(container)[0]?.disabled).toBe(true);
    expect(screen.getAllByText("Importing").length).toBe(2);
  });

  const exportsByPosition = [
    ["QB", "Player,Team,BYE,ATT,CMP,YDS,TDS,INTS,ATT,YDS,TDS,FL,FPTS"],
    ["RB", "Player,Team,BYE,ATT,YDS,TDS,REC,YDS,TDS,FL,FPTS"],
    ["WR", "Player,Team,BYE,REC,YDS,TDS,ATT,YDS,TDS,FL,FPTS"],
    ["TE", "Player,Team,BYE,REC,YDS,TDS,FL,FPTS"],
    ["K", "Player,Team,BYE,FG,FGA,XPT,FPTS\nBrandon Aubrey,DAL,14,34.8,39.5,47.0,151.4"],
    ["DST", "Player,Team,BYE,SACK,INT,FR,FF,TD,SAFETY,PA,YDS_AGN,FPTS"],
  ];

  it("imports all six season files with duplicate-download suffixes", async () => {
    const onImportSeasonProjections = vi.fn();
    const { container } = render(DraftPreparationChecklist, props({ rankingImportSummary: rankings, onImportSeasonProjections }));
    const input = fileInputs(container)[0]!;
    expect(input.multiple).toBe(true);
    await fireEvent.change(input, {
      target: { files: exportsByPosition.map(([position, csv]) => ({
        name: `FantasyPros_Fantasy_Football_Projections_${position} (4).csv`, text: async () => csv,
      })) },
    });
    await waitFor(() => expect(onImportSeasonProjections).toHaveBeenCalledOnce());
    expect(onImportSeasonProjections).toHaveBeenCalledWith({
      season: "2026", files: exportsByPosition.map(([position, csvText]) => ({ position: position === "DST" ? "DEF" : position, csvText })),
    });
    expect(screen.queryByText(/One or more files could not be identified/)).toBeNull();
  });

  it("rejects duplicate positions without importing and clears the message with the data", async () => {
    const onImportSeasonProjections = vi.fn();
    const onClearSeasonProjections = vi.fn();
    const { container } = render(DraftPreparationChecklist, props({
      rankingImportSummary: rankings, seasonProjectionImportSummary: projections, onImportSeasonProjections, onClearSeasonProjections,
    }));
    await fireEvent.click(screen.getByRole("button", { name: /season projections/ }));
    await fireEvent.change(fileInputs(container)[0]!, { target: { files: ["FantasyPros_QB.csv", "FantasyPros_QB (4).csv"].map((name) => ({
      name, text: async () => "Player,Team,FPTS",
    })) } });
    await screen.findByText("Select only one FantasyPros projection file per position.");
    expect(onImportSeasonProjections).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: /^Clear .* season projections$/ }));
    expect(onClearSeasonProjections).toHaveBeenCalledOnce();
    expect(screen.queryByText("Select only one FantasyPros projection file per position.")).toBeNull();
  });

  it("confirms the Assistant from the primary with the form still closed", async () => {
    const onSaveSettings = vi.fn();
    const { container } = render(DraftPreparationChecklist, props({ ...ready, providerStatus: assistantOff, onSaveSettings }));
    expect(screen.queryByRole("textbox", { name: "Codex command or path" })).toBeNull();
    expect(screen.queryByText(/No external AI provider/)).toBeNull();

    const confirm = screen.getByRole("button", { name: "Confirm Assistant settings" });
    const form = container.querySelector<HTMLFormElement>(`form#${confirm.getAttribute("form")}`);
    await fireEvent.submit(form!);

    expect(onSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ aiProvider: "codex-app-server", aiSetupAcknowledged: true }));
  });

  it("keeps every Assistant control behind Change settings first, with no second primary", async () => {
    const { container } = render(DraftPreparationChecklist, props({ ...ready, providerStatus: assistantOff }));
    await fireEvent.click(screen.getByRole("button", { name: /Change settings first/ }));
    for (const label of ["Provider", "Codex command or path", /^Model/, "Response timeout (ms)", "Fast responses", "Web search"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(livePrimaries(container)).toEqual(["Confirm Assistant settings"]);
  });

  it("offers a save inside a ready Assistant row", async () => {
    const { container } = render(DraftPreparationChecklist, props(ready));
    await fireEvent.click(screen.getByRole("button", { name: /Assistant/ }));
    await fireEvent.click(screen.getByRole("button", { name: /Change settings/ }));
    expect(screen.getByRole("textbox", { name: "Codex command or path" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Assistant settings" })).toBeTruthy();
    expect(livePrimaries(container)).toEqual(["Enter draft room"]);
  });

  it("explains an unavailable Assistant in the row, and on the collapsed line ahead of its turn", () => {
    const first = render(DraftPreparationChecklist, props({ ...ready, providerStatus: assistantBroken }));
    expect(within(first.container).getByRole("alert").textContent).toContain("Codex could not start.");
    first.unmount();

    render(DraftPreparationChecklist, props({ providerStatus: assistantBroken }));
    expect(screen.getByRole("button", { name: /Assistant/ }).textContent).toContain("Needs attention");
  });

  it("does not count steps while the Assistant is still being checked", () => {
    const { container } = render(DraftPreparationChecklist, props({ ...ready, providerStatus: null }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Checking the Assistant");
    expect(screen.getByText("Checking")).toBeTruthy();
    expect(container.querySelector(".spinner")).toBeTruthy();
  });

  it("offers the emergency board only while a draft is live and setup is unfinished", async () => {
    const onOpenEmergency = vi.fn();
    const { rerender } = render(DraftPreparationChecklist, props({ onOpenEmergency }));
    expect(screen.queryByRole("button", { name: "Open emergency board only" })).toBeNull();

    await rerender(props({ onOpenEmergency, liveDraft: true }));
    await fireEvent.click(screen.getByRole("button", { name: "Open emergency board only" }));
    expect(onOpenEmergency).toHaveBeenCalledOnce();
    expect(screen.getByText(/disables Assistant advice/)).toBeTruthy();

    await rerender(props({ ...ready, onOpenEmergency, liveDraft: true }));
    expect(screen.queryByRole("button", { name: "Open emergency board only" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enter draft room" })).toBeTruthy();
  });

  it("reviews a completed draft without promising the room or demanding data", async () => {
    const onContinue = vi.fn();
    const { container } = render(DraftPreparationChecklist, props({ draftComplete: true, statusLabel: "Complete", liveDraft: false, onContinue }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Draft is over");
    expect(livePrimaries(container)).toEqual(["View draft results"]);
    expect(screen.getByRole("button", { name: /PPR ECR/ }).textContent).toContain("Not imported");
    expect(screen.getByRole("button", { name: /Assistant/ }).textContent).toContain("Not set up");
    expect(screen.queryByText(/Opens when/)).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "View draft results" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("moves focus to the next primary when a finished step removes the focused control", async () => {
    const { container, rerender } = render(DraftPreparationChecklist, props({ isImportingRankings: true }));
    expect(fileInputs(container)).toHaveLength(1);
    (document.activeElement as HTMLElement | null)?.blur();

    await rerender(props({ rankingImportSummary: rankings }));

    await waitFor(() => expect(document.activeElement).toBe(fileInputs(container)[0]));
    expect(fileInputs(container)[0]?.multiple).toBe(true);
  });

  it("moves focus to Enter draft room when the last step finishes", async () => {
    const { rerender } = render(DraftPreparationChecklist, props({ ...ready, providerStatus: assistantOff, isSavingSettings: true }));
    await rerender(props(ready));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Enter draft room" })));
  });

  it("keeps focus in the row when clearing a source that is not the next step", async () => {
    const { container, rerender } = render(DraftPreparationChecklist, props({ adpImportSummary: adp }));
    await fireEvent.click(screen.getByRole("button", { name: /Sleeper ADP/ }));
    await rerender(props({ adpImportSummary: adp, isClearingAdp: true }));
    await rerender(props({}));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Upload CSV for Sleeper ADP")));
    expect(fileInputs(container)).toHaveLength(2);
  });

  it("does not take focus from somewhere the user moved it", async () => {
    const elsewhere = document.body.appendChild(document.createElement("button"));
    const { rerender } = render(DraftPreparationChecklist, props({ isImportingRankings: true }));
    elsewhere.focus();
    await rerender(props({ rankingImportSummary: rankings }));
    await waitFor(() => expect(screen.getByRole("button", { name: /PPR ECR/ })).toBeTruthy());
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});
