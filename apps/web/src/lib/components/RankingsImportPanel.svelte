<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { RankingImportSummary } from "../types";
  import { formatImportDate } from "../format";

  let {
    hasDraft,
    hasImportedRankings,
    isImportingRankings,
    isClearingRankings,
    rankingImportSummary,
    rankingImportError,
    onImport,
    onClear,
    onOpenFantasyPros,
    expanded = $bindable(false),
  }: {
    hasDraft: boolean;
    hasImportedRankings: boolean;
    isImportingRankings: boolean;
    isClearingRankings: boolean;
    rankingImportSummary: RankingImportSummary | null;
    rankingImportError: string;
    onImport: (csvText: string) => void;
    onClear: () => void;
    onOpenFantasyPros: () => void;
    expanded?: boolean;
  } = $props();

  let rankingCsvText = $state("");

  const summaryText = $derived(
    hasImportedRankings
      ? `${rankingImportSummary?.matched ?? 0} matched - ${formatImportDate(rankingImportSummary!)}`
      : hasDraft
        ? "Not imported yet"
        : "Available after draft selection",
  );

  async function readRankingFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    rankingCsvText = await file.text();
  }

  function submitImport() {
    onImport(rankingCsvText.trim());
  }

  function toggleExpanded() {
    if (hasDraft) {
      expanded = !expanded;
    }
  }
</script>

<section class="panel rankings-panel" class:disabled-panel={!hasDraft} aria-label="Ranking import">
  <div class="section-header">
    <button class="header-toggle" type="button" onclick={toggleExpanded} aria-expanded={expanded} disabled={!hasDraft}>
      <Icon name="chevron-right" size={14} />
      <div>
        <h2><Icon name="upload" size={17} /> Import player values</h2>
        {#if !expanded}
          <span class="collapsed-summary">{summaryText}</span>
        {/if}
      </div>
    </button>
    <div class="header-actions">
      {#if expanded}
        <button class="btn btn-secondary" type="button" onclick={onOpenFantasyPros}>
          Open FantasyPros
          <Icon name="external" size={13} />
        </button>
      {/if}
      {#if expanded && hasImportedRankings}
        <button class="btn btn-secondary" type="button" disabled={isClearingRankings} onclick={onClear}>
          {isClearingRankings ? "Clearing" : "Clear import"}
        </button>
      {/if}
      <span class="pill" class:pill-ready={hasImportedRankings} class:pill-warning={hasDraft && !hasImportedRankings}>
        {hasImportedRankings ? "Imported" : hasDraft ? "Ready to import" : "After draft selection"}
      </span>
    </div>
  </div>

  {#if expanded}
  <div class="rankings-layout">
    <div class="rankings-instructions">
      <strong>Add reliable player values</strong>
      <p>
        Download the FantasyPros rankings CSV for this scoring format, then upload it here. The import is saved to this draft and replaces low-confidence Sleeper search ranks.
      </p>
    </div>

    <div class="rankings-controls">
      <label class="field">
        <span>FantasyPros CSV</span>
        <input class="input" type="file" accept=".csv,text/csv" onchange={readRankingFile} />
      </label>
      <textarea class="input" bind:value={rankingCsvText} rows="5" placeholder="Or paste FantasyPros CSV text here. Expected columns include RK, PLAYER NAME, TEAM, POS, BYE, SOS, and ECR VS. ADP."></textarea>
      <button class="btn btn-primary" type="button" disabled={isImportingRankings || isClearingRankings || !hasDraft} onclick={submitImport}>
        {#if isImportingRankings}<span class="spinner"></span>{/if}
        {isImportingRankings ? "Importing" : "Import rankings"}
      </button>
      {#if !hasDraft}
        <p class="inline-hint">Select a Sleeper draft before importing rankings.</p>
      {/if}
    </div>
  </div>

  {#if rankingImportSummary}
    <p class="import-status">
      Active import: FantasyPros rankings from {formatImportDate(rankingImportSummary)}. Saved for this draft and
      reapplied automatically.
    </p>
    <div class="import-summary">
      <div>
        <strong>{rankingImportSummary.matched}</strong>
        <span>matched</span>
      </div>
      <div>
        <strong>{rankingImportSummary.rowsParsed}</strong>
        <span>rows parsed</span>
      </div>
      <div>
        <strong>{rankingImportSummary.unmatched.length}</strong>
        <span>unmatched</span>
      </div>
      <div>
        <strong>{rankingImportSummary.ambiguous.length}</strong>
        <span>ambiguous</span>
      </div>
    </div>

    {#if rankingImportSummary.unmatched.length > 0 || rankingImportSummary.ambiguous.length > 0}
      <div class="import-review">
        {#if rankingImportSummary.unmatched.length > 0}
          <details class="disclosure">
            <summary>Unmatched rows</summary>
            <ul>
              {#each rankingImportSummary.unmatched.slice(0, 12) as row}
                <li>{row.row}: {row.name} {row.team ? `(${row.team})` : ""}</li>
              {/each}
            </ul>
          </details>
        {/if}

        {#if rankingImportSummary.ambiguous.length > 0}
          <details class="disclosure">
            <summary>Ambiguous rows</summary>
            <ul>
              {#each rankingImportSummary.ambiguous.slice(0, 12) as row}
                <li>{row.row}: {row.name} matched multiple players: {row.candidates.join(", ")}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>
    {/if}
  {/if}

  {#if rankingImportError}
    <p class="callout callout-danger"><Icon name="alert" size={15} />{rankingImportError}</p>
  {/if}
  {/if}
</section>

<style>
  .rankings-panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
    transition: opacity var(--transition-base);
  }

  .rankings-panel.disabled-panel {
    opacity: 0.85;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .header-toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .header-toggle:disabled {
    cursor: default;
  }

  .header-toggle > :global(.icon) {
    margin-top: 6px;
    color: var(--text-muted);
    transition: transform var(--transition-base);
  }

  .header-toggle[aria-expanded="true"] > :global(.icon) {
    transform: rotate(90deg);
  }

  .header-toggle:disabled > :global(.icon) {
    visibility: hidden;
  }

  .section-header h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-lg);
    margin-top: 2px;
  }

  .collapsed-summary {
    display: block;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .rankings-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .rankings-instructions {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: var(--space-3) var(--space-4);
  }

  .rankings-instructions p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    line-height: 1.5;
    font-size: var(--text-sm);
  }

  .rankings-controls {
    display: grid;
    gap: 10px;
  }

  .rankings-controls textarea {
    min-height: 116px;
  }

  .inline-hint {
    margin: -2px 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .import-status {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .import-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    overflow: hidden;
  }

  .import-summary div {
    padding: 10px 12px;
    border-right: 1px solid var(--border);
  }

  .import-summary div:last-child {
    border-right: 0;
  }

  .import-summary strong {
    display: block;
    color: var(--accent);
    font-size: var(--text-xl);
  }

  .import-summary span {
    display: block;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .import-review {
    display: grid;
    gap: 8px;
  }

  .disclosure {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .disclosure summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-weight: 700;
    font-size: var(--text-sm);
    list-style: none;
  }

  .disclosure summary::-webkit-details-marker {
    display: none;
  }

  .disclosure summary:hover {
    color: var(--text-primary);
  }

  .disclosure ul {
    margin: 8px 0 0;
    padding-left: 18px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  @media (max-width: 720px) {
    .section-header {
      align-items: stretch;
      flex-direction: column;
    }

    .import-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .import-summary div:nth-child(2) {
      border-right: 0;
    }
  }
</style>
