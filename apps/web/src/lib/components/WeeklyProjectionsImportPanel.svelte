<script lang="ts">
  import { onDestroy } from "svelte";
  import { WEEKLY_SCORING_REMINDER } from "@sleeper-draft-assistant/engine";
  import DataLine from "./DataLine.svelte";
  import FileInput from "./FileInput.svelte";
  import Icon from "./Icon.svelte";
  import SelectedProjectionFiles from "./SelectedProjectionFiles.svelte";
  import type { Position, WeeklyProjectionImportSummary } from "../types";
  import { formatImportDate } from "../format";
  import { getImportFreshness, getOldestImportAppliedAt } from "../freshness";
  import { importLabel, WeeklyFileSelection } from "../weekly-file-selection.svelte";

  const positionOptions: Array<{ value: Position; label: string }> = [
    { value: "QB", label: "QB" },
    { value: "RB", label: "RB" },
    { value: "WR", label: "WR" },
    { value: "TE", label: "TE" },
    { value: "K", label: "K" },
    { value: "DEF", label: "DST/DEF" },
  ];
  const requiredPositions: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

  let {
    hasTeam,
    defaultSeason,
    defaultWeek,
    shownWeek = null,
    leagueSeason,
    loadedFiles,
    neededFiles,
    summary,
    error = $bindable(""),
    isImporting,
    isClearing,
    open = $bindable(false),
    onImport,
    onLoadContext,
    onClear,
    onOpenFantasyPros,
  }: {
    hasTeam: boolean;
    defaultSeason: string;
    defaultWeek: number;
    shownWeek?: number | null;
    leagueSeason: string;
    loadedFiles: number;
    neededFiles: number;
    summary: WeeklyProjectionImportSummary | null;
    error: string;
    isImporting: boolean;
    isClearing: boolean;
    open?: boolean;
    onImport: (input: { files: Array<{ position: Position; csvText: string }>; season: string; week: number }) => void;
    onLoadContext: (input: { season: string; week: number }) => void;
    onClear: (input: { season: string; week: number }) => void;
    onOpenFantasyPros: (position: Position, week: number) => void;
  } = $props();

  const selection = new WeeklyFileSelection();
  let csvText = $state("");
  let fileInput: HTMLInputElement | undefined = $state();
  let position: Position = $state("QB");
  let season = $state("");
  let week = $state(0);

  onDestroy(() => selection.clear());

  // These follow the view when it moves (Back to Week, an accepted load) without overwriting a value typed since.
  $effect(() => {
    if (defaultSeason) season = defaultSeason;
  });

  $effect(() => {
    week = defaultWeek || 1;
  });

  const freshness = $derived(summary
    ? getImportFreshness(
        getOldestImportAppliedAt(summary.positionResults.map((result) => result.appliedAt), summary.appliedAt),
        3,
      )
    : null);
  const otherSeason = $derived(Boolean(summary && leagueSeason && summary.season !== leagueSeason));
  const lineSummary = $derived.by(() => {
    if (!summary) return hasTeam ? "Not imported yet" : "Available after team load";
    if (otherSeason) return `Saved for ${summary.season} · not used by advice`;
    const saved = new Date(summary.appliedAt).toLocaleDateString([], { month: "short", day: "numeric" });
    return `${loadedFiles} of ${neededFiles} files · Week ${summary.week} · saved ${saved} (${freshness?.label})`;
  });
  const targetsOtherWeek = $derived(Boolean(hasTeam && shownWeek && week && week !== shownWeek));
  const totalUnmatched = $derived(summary?.positionResults.reduce((total, result) => total + result.unmatched, 0) ?? 0);
  const totalAmbiguous = $derived(summary?.positionResults.reduce((total, result) => total + result.ambiguous, 0) ?? 0);

  async function readProjectionFiles(event: Event) {
    const files = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
    if (files.length === 0) {
      return;
    }

    error = "";
    csvText = "";
    if (!(await selection.read(files, position))) {
      error = "Could not read the selected files. Select them again or paste the CSV.";
    }
  }

  function usePastedCsv() {
    if (fileInput) fileInput.value = "";
    selection.clear();
    error = "";
  }

  function submitImport() {
    const files = selection.files.length > 0
      ? selection.files.map((file) => ({ position: file.position, csvText: file.csvText }))
      : csvText.trim()
        ? [{ position, csvText: csvText.trim() }]
        : [];
    onImport({ files, season: season.trim(), week: Number(week) });
  }
</script>

<DataLine name="weekly" title="Weekly projections" summary={lineSummary} warn={otherSeason || Boolean(freshness?.stale) || Boolean(error)} bind:open>
  <p class="instructions">Select all six position files together, or one to replace a position. The FLEX export is redundant.</p>

  <div class="control-grid">
    <label class="field">
      <span>Season</span>
      <input class="input" bind:value={season} placeholder="2025" disabled={!hasTeam || isImporting || isClearing} />
    </label>
    <label class="field">
      <span>Week</span>
      <input class="input" type="number" min="1" max="22" bind:value={week} disabled={!hasTeam || isImporting || isClearing} />
    </label>
    <label class="field">
      <span>Position file</span>
      <select class="input" bind:value={position} disabled={!hasTeam || isImporting || isClearing}>
        {#each positionOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if targetsOtherWeek}
    <p class="target-note">Week {shownWeek} is on screen. Load selected week to switch, or import files into Week {week}.</p>
  {/if}

  <div class="action-row">
    <button class="btn btn-secondary" type="button" disabled={!hasTeam || isImporting || isClearing} onclick={() => onLoadContext({ season: season.trim(), week: Number(week) })}>
      Load selected week
    </button>
    <button class="btn btn-secondary" type="button" disabled={!hasTeam} onclick={() => onOpenFantasyPros(position, Number(week))}>
      Open FantasyPros
      <Icon name="external" size={13} />
    </button>
    {#if summary}
      <button class="btn btn-ghost" type="button" disabled={isClearing || isImporting} onclick={() => onClear({ season: summary.season, week: summary.week })}>
        {isClearing ? "Clearing" : "Clear week"}
      </button>
    {/if}
  </div>

  <FileInput
    bind:input={fileInput}
    caption="Projection CSV"
    label={summary ? "Replace files" : "Choose CSV files"}
    selection={selection.files.length > 0 ? undefined : csvText.trim() ? "Using pasted CSV" : "No files selected"}
    multiple
    disabled={!hasTeam || isImporting || isClearing}
    onchange={readProjectionFiles}
  />
  <SelectedProjectionFiles {selection} />
  <details class="disclosure">
    <summary>Paste CSV instead</summary>
    <label class="field">
      <span>CSV for the selected position</span>
      <textarea
        class="input"
        bind:value={csvText}
        oninput={usePastedCsv}
        rows="5"
        placeholder="Paste a FantasyPros weekly projections CSV."
        disabled={!hasTeam || isImporting || isClearing}
      ></textarea>
    </label>
  </details>

  <button class="btn btn-primary btn-block" type="button" disabled={!hasTeam || isImporting || isClearing || (selection.files.length === 0 && !csvText.trim())} onclick={submitImport}>
    {#if isImporting}<span class="spinner"></span>{/if}
    {isImporting ? "Importing" : importLabel(selection.files, position)}
  </button>

  {#if summary}
    <p class="import-status" class:stale={freshness?.stale}>
      Active import: FantasyPros {summary.position ?? "multi-position"} projections for {summary.season} Week {summary.week},
      saved {formatImportDate(summary)} ({freshness?.label}).
    </p>
    <div class="position-status" aria-label="Weekly projection position import status" role="group">
      {#each requiredPositions as requiredPosition}
        {@const result = summary.positionResults.find((item) => item.position === requiredPosition)}
        <span class:loaded={Boolean(result?.matched)}>
          {requiredPosition === "DEF" ? "DST" : requiredPosition}
          <small>{result ? `${result.matched}/${result.rowsParsed}` : "Needed"}</small>
        </span>
      {/each}
    </div>
    <div class="import-summary">
      <div>
        <strong>{summary.matched}</strong>
        <span>matched</span>
      </div>
      <div>
        <strong>{summary.rowsParsed}</strong>
        <span>rows parsed</span>
      </div>
      <div>
        <strong>{totalUnmatched}</strong>
        <span>unmatched</span>
      </div>
      <div>
        <strong>{totalAmbiguous}</strong>
        <span>ambiguous</span>
      </div>
    </div>

    {#if summary.unmatched.length > 0 || summary.ambiguous.length > 0}
      <div class="import-review">
        {#if summary.unmatched.length > 0}
          <details class="disclosure">
            <summary>Unmatched rows</summary>
            <ul>
              {#each summary.unmatched.slice(0, 8) as row}
                <li>{row.row}: {row.name} {row.team ? `(${row.team})` : ""}</li>
              {/each}
            </ul>
          </details>
        {/if}

        {#if summary.ambiguous.length > 0}
          <details class="disclosure">
            <summary>Ambiguous rows</summary>
            <ul>
              {#each summary.ambiguous.slice(0, 8) as row}
                <li>{row.row}: {row.name} matched multiple players</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>
    {/if}

    <p class="instructions">{WEEKLY_SCORING_REMINDER}</p>
  {/if}

  {#if error}
    <p class="callout callout-danger"><Icon name="alert" size={15} />{error}</p>
  {/if}
</DataLine>

<style>
  .instructions,
  .target-note {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .target-note {
    color: var(--warning);
  }

  .import-summary,
  .position-status {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
  }

  .control-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 88px minmax(0, 1fr);
    gap: 8px;
  }

  .action-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .import-status {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.45;
  }

  .import-status.stale {
    color: var(--warning);
  }

  .position-status {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    overflow: hidden;
  }

  .position-status > span {
    display: grid;
    gap: 2px;
    padding: 7px 5px;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    text-align: center;
  }

  .position-status > span:last-child {
    border-right: 0;
  }

  .position-status > span.loaded {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .position-status small {
    color: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .import-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow: hidden;
  }

  .import-summary div {
    padding: 8px 9px;
    border-right: 1px solid var(--border);
  }

  .import-summary div:last-child {
    border-right: 0;
  }

  .import-summary strong {
    display: block;
    color: var(--accent);
    font-size: var(--text-lg);
  }

  .import-summary span {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .import-review {
    display: grid;
    gap: 8px;
  }

  .disclosure {
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .disclosure summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 600;
    list-style: none;
  }

  .disclosure summary::-webkit-details-marker {
    display: none;
  }

  .disclosure ul {
    margin: 8px 0 0;
    padding-left: 18px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  @media (max-width: 760px) {
    .control-grid,
    .import-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .position-status {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .control-grid .field:last-child {
      grid-column: 1 / -1;
    }

    .import-summary div:nth-child(2) {
      border-right: 0;
    }
  }
</style>
