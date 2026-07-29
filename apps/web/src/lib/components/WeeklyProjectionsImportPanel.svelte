<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { Position, WeeklyProjectionImportSummary } from "../types";
  import { formatImportDate } from "../format";

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
    leagueSeason,
    currentWeek,
    summary,
    rosLoaded,
    error,
    isImporting,
    isClearing,
    onImport,
    onLoadContext,
    onClear,
    onOpenFantasyPros,
  }: {
    hasTeam: boolean;
    defaultSeason: string;
    defaultWeek: number;
    leagueSeason: string;
    currentWeek: number;
    summary: WeeklyProjectionImportSummary | null;
    rosLoaded: boolean;
    error: string;
    isImporting: boolean;
    isClearing: boolean;
    onImport: (input: { files: Array<{ position: Position; csvText: string }>; season: string; week: number }) => void;
    onLoadContext: (input: { season: string; week: number }) => void;
    onClear: (input: { season: string; week: number }) => void;
    onOpenFantasyPros: (position: Position, week: number) => void;
  } = $props();

  let csvText = $state("");
  let selectedFiles: Array<{ name: string; position: Position; csvText: string }> = $state([]);
  let ignoredFiles: string[] = $state([]);
  let position: Position = $state("QB");
  let season = $state("");
  let week = $state(0);

  $effect(() => {
    if (!season && defaultSeason) {
      season = defaultSeason;
    }
  });

  $effect(() => {
    if (!week) {
      week = defaultWeek || 1;
    }
  });

  const statusText = $derived(
    summary
      ? `${summary.matched} matched for ${summary.season} Week ${summary.week}`
      : hasTeam
        ? "Not imported yet"
        : "Available after team load",
  );
  const sourceCount = $derived(Number(Boolean(summary)) + Number(rosLoaded));
  const hasImportMismatch = $derived(Boolean(summary && leagueSeason && summary.season !== leagueSeason));
  const viewingDifferentWeek = $derived(Boolean(currentWeek && week !== currentWeek));
  const totalUnmatched = $derived(summary?.positionResults.reduce((total, result) => total + result.unmatched, 0) ?? 0);
  const totalAmbiguous = $derived(summary?.positionResults.reduce((total, result) => total + result.ambiguous, 0) ?? 0);

  async function readProjectionFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    const parsedFiles = await Promise.all(files.map(async (file) => ({
      name: file.name,
      position: inferPositionFromFilename(file.name),
      csvText: await file.text(),
    })));
    ignoredFiles = parsedFiles.filter((file) => !file.position).map((file) => file.name);
    const byPosition = new Map<Position, { name: string; position: Position; csvText: string }>();
    for (const file of parsedFiles) {
      const resolvedPosition = file.position ?? (files.length === 1 ? position : null);
      if (resolvedPosition) {
        byPosition.set(resolvedPosition, { ...file, position: resolvedPosition });
      }
    }
    selectedFiles = Array.from(byPosition.values());
    csvText = "";
  }

  function submitImport() {
    const files = selectedFiles.length > 0
      ? selectedFiles.map((file) => ({ position: file.position, csvText: file.csvText }))
      : csvText.trim()
        ? [{ position, csvText: csvText.trim() }]
        : [];
    onImport({ files, season: season.trim(), week: Number(week) });
  }

  function clearImport() {
    onClear({ season: season.trim(), week: Number(week) });
  }

  function inferPositionFromFilename(filename: string): Position | null {
    const normalized = filename.toUpperCase();
    for (const candidate of ["QB", "RB", "WR", "TE", "K"] as Position[]) {
      if (new RegExp(`(?:^|[_\\s-])${candidate}(?:[_.\\s-]|$)`).test(normalized)) {
        return candidate;
      }
    }
    return /(?:DST|DEF)/.test(normalized) ? "DEF" : null;
  }
</script>

<article class="panel weekly-import-panel" class:disabled-panel={!hasTeam}>
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">FantasyPros</p>
      <h2><Icon name="upload" size={17} /> Weekly projections</h2>
      <span class="collapsed-summary">{statusText}</span>
    </div>
    <span class="pill" class:pill-ready={sourceCount === 2} class:pill-warning={hasTeam && sourceCount < 2}>
      {hasTeam ? `${sourceCount}/2 sources` : "After team load"}
    </span>
  </div>

  <div class="weekly-instructions">
    <strong>Select all six position files together</strong>
    <p>
      Download FantasyPros weekly projections for QB, RB, WR, TE, K, and DST, then select them together. You can still
      import or replace one position at a time. The FLEX export is redundant.
    </p>
  </div>

  {#if hasImportMismatch && summary}
    <p class="callout callout-warning">
      <Icon name="alert" size={15} />
      Imported data is for {summary.season} Week {summary.week}, but this team view is
      connected to a {leagueSeason} Sleeper league. It is saved for reference but is not used by lineup, waiver, or AI advice.
    </p>
  {/if}

  {#if viewingDifferentWeek}
    <p class="callout callout-warning">
      <Icon name="alert" size={15} />
      Viewing Week {week}; Sleeper currently reports Week {currentWeek}. Advice will use the selected week's saved projections.
    </p>
  {/if}

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

  <div class="action-row">
    <button class="btn btn-secondary" type="button" disabled={!hasTeam || isImporting || isClearing} onclick={() => onLoadContext({ season: season.trim(), week: Number(week) })}>
      Load selected week
    </button>
    <button class="btn btn-secondary" type="button" disabled={!hasTeam} onclick={() => onOpenFantasyPros(position, Number(week))}>
      Open FantasyPros
      <Icon name="external" size={13} />
    </button>
    {#if summary}
      <button class="btn btn-secondary" type="button" disabled={isClearing || isImporting} onclick={clearImport}>
        {isClearing ? "Clearing" : "Clear week"}
      </button>
    {/if}
  </div>

  <label class="field">
    <span>Projection CSV</span>
    <input class="input" type="file" accept=".csv,text/csv" multiple disabled={!hasTeam || isImporting || isClearing} onchange={readProjectionFiles} />
  </label>
  {#if selectedFiles.length > 0}
    <div class="selected-files">
      {#each selectedFiles as file}
        <span><strong>{file.position === "DEF" ? "DST" : file.position}</strong>{file.name}</span>
      {/each}
    </div>
  {/if}
  {#if ignoredFiles.length > 0}
    <p class="muted-file-note">
      Ignored {ignoredFiles.join(", ")}. FLEX is redundant when RB, WR, and TE files are included.
    </p>
  {/if}
  <textarea
    class="input"
    bind:value={csvText}
    rows="5"
    placeholder="Or paste a FantasyPros weekly projections CSV here. Expected columns vary by position and end with FPTS."
    disabled={!hasTeam || isImporting || isClearing}
  ></textarea>

  <button class="btn btn-primary btn-block" type="button" disabled={!hasTeam || isImporting || isClearing || (selectedFiles.length === 0 && !csvText.trim())} onclick={submitImport}>
    {#if isImporting}<span class="spinner"></span>{/if}
    {isImporting ? "Importing" : selectedFiles.length > 1 ? `Import ${selectedFiles.length} files` : `Import ${selectedFiles[0]?.position === "DEF" || (!selectedFiles[0] && position === "DEF") ? "DST" : selectedFiles[0]?.position ?? position}`}
  </button>

  {#if summary}
    <p class="import-status">
      Active import: FantasyPros {summary.position ?? "multi-position"} projections for {summary.season} Week {summary.week},
      saved {formatImportDate(summary)}.
    </p>
    <div class="position-status" aria-label="Weekly projection position import status">
      {#each requiredPositions as requiredPosition}
        {@const result = summary.positionResults.find((item) => item.position === requiredPosition)}
        <span class:loaded={Boolean(result)}>
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
  {/if}

  {#if error}
    <p class="callout callout-danger"><Icon name="alert" size={15} />{error}</p>
  {/if}
</article>

<style>
  .weekly-import-panel {
    display: grid;
    gap: 10px;
  }

  .disabled-panel {
    opacity: 0.85;
  }

  .collapsed-summary {
    display: block;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .weekly-instructions,
  .import-summary,
  .position-status,
  .selected-files {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
  }

  .weekly-instructions {
    padding: 9px 10px;
  }

  .weekly-instructions p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.45;
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

  .position-status {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    overflow: hidden;
  }

  .selected-files {
    display: grid;
    gap: 5px;
    padding: 8px;
  }

  .selected-files span {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 7px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .selected-files strong {
    color: var(--accent);
  }

  .muted-file-note {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .position-status > span {
    display: grid;
    gap: 2px;
    padding: 7px 5px;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 900;
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
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
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
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.05em;
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
    font-weight: 800;
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

  @media (max-width: 720px) {
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
