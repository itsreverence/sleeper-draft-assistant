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

  let {
    hasTeam,
    defaultSeason,
    defaultWeek,
    summary,
    error,
    isImporting,
    isClearing,
    onImport,
    onClear,
    onOpenFantasyPros,
  }: {
    hasTeam: boolean;
    defaultSeason: string;
    defaultWeek: number;
    summary: WeeklyProjectionImportSummary | null;
    error: string;
    isImporting: boolean;
    isClearing: boolean;
    onImport: (input: { csvText: string; position: Position; season: string; week: number }) => void;
    onClear: (input: { season: string; week: number }) => void;
    onOpenFantasyPros: (position: Position, week: number) => void;
  } = $props();

  let csvText = $state("");
  let position: Position = $state("QB");
  let season = $state("");
  let week = $state(0);

  $effect(() => {
    if (!season && defaultSeason) {
      season = defaultSeason;
    }
  });

  $effect(() => {
    if (!week && defaultWeek) {
      week = defaultWeek;
    }
  });

  const statusText = $derived(
    summary
      ? `${summary.matched} matched for ${summary.season} Week ${summary.week}`
      : hasTeam
        ? "Not imported yet"
        : "Available after team load",
  );

  async function readProjectionFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    csvText = await file.text();
  }

  function submitImport() {
    onImport({ csvText: csvText.trim(), position, season: season.trim(), week: Number(week) });
  }

  function clearImport() {
    onClear({ season: season.trim(), week: Number(week) });
  }
</script>

<article class="panel weekly-import-panel" class:disabled-panel={!hasTeam}>
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">FantasyPros</p>
      <h2><Icon name="upload" size={17} /> Weekly projections</h2>
      <span class="collapsed-summary">{statusText}</span>
    </div>
    <span class="pill" class:pill-ready={Boolean(summary)} class:pill-warning={hasTeam && !summary}>
      {summary ? "Imported" : hasTeam ? "Optional import" : "After team load"}
    </span>
  </div>

  <div class="weekly-instructions">
    <strong>Import one position file at a time</strong>
    <p>
      Download FantasyPros weekly projections for QB, RB, WR, TE, K, and DST. Each import adds to the same league/week,
      so importing RB will not remove the QB file you already imported.
    </p>
  </div>

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
    <input class="input" type="file" accept=".csv,text/csv" disabled={!hasTeam || isImporting || isClearing} onchange={readProjectionFile} />
  </label>
  <textarea
    class="input"
    bind:value={csvText}
    rows="5"
    placeholder="Or paste a FantasyPros weekly projections CSV here. Expected columns vary by position and end with FPTS."
    disabled={!hasTeam || isImporting || isClearing}
  ></textarea>

  <button class="btn btn-primary btn-block" type="button" disabled={!hasTeam || isImporting || isClearing || !csvText.trim()} onclick={submitImport}>
    {#if isImporting}<span class="spinner"></span>{/if}
    {isImporting ? "Importing" : `Import ${position === "DEF" ? "DST" : position}`}
  </button>

  {#if summary}
    <p class="import-status">
      Active import: FantasyPros {summary.position ?? "multi-position"} projections for {summary.season} Week {summary.week},
      saved {formatImportDate(summary)}.
    </p>
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
        <strong>{summary.unmatched.length}</strong>
        <span>unmatched</span>
      </div>
      <div>
        <strong>{summary.ambiguous.length}</strong>
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
  .import-summary {
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

    .control-grid .field:last-child {
      grid-column: 1 / -1;
    }

    .import-summary div:nth-child(2) {
      border-right: 0;
    }
  }
</style>
