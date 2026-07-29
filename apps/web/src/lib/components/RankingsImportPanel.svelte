<script lang="ts">
  import type { AdpImportSummary, Position, RankingImportSummary, SeasonProjectionImportSummary } from "../types";
  import { formatImportDate } from "../format";
  import { getImportFreshness } from "../freshness";
  import Icon from "./Icon.svelte";

  let {
    hasDraft,
    scoring,
    season,
    rankingImportSummary,
    seasonProjectionImportSummary,
    adpImportSummary,
    rankingImportError,
    seasonProjectionImportError,
    adpImportError,
    isImportingRankings,
    isClearingRankings,
    isImportingSeasonProjections,
    isClearingSeasonProjections,
    isImportingAdp,
    isClearingAdp,
    onImportRankings,
    onImportSeasonProjections,
    onImportAdp,
    onClearRankings,
    onClearSeasonProjections,
    onClearAdp,
    onOpenRankings,
    onOpenSeasonProjections,
    onOpenAdp,
    expanded = $bindable(false),
  }: {
    hasDraft: boolean;
    scoring: string;
    season: string;
    rankingImportSummary: RankingImportSummary | null;
    seasonProjectionImportSummary: SeasonProjectionImportSummary | null;
    adpImportSummary: AdpImportSummary | null;
    rankingImportError: string;
    seasonProjectionImportError: string;
    adpImportError: string;
    isImportingRankings: boolean;
    isClearingRankings: boolean;
    isImportingSeasonProjections: boolean;
    isClearingSeasonProjections: boolean;
    isImportingAdp: boolean;
    isClearingAdp: boolean;
    onImportRankings: (csvText: string) => void;
    onImportSeasonProjections: (input: { season: string; files: Array<{ position: Position; csvText: string }> }) => void;
    onImportAdp: (csvText: string, season: string) => void;
    onClearRankings: () => void;
    onClearSeasonProjections: () => void;
    onClearAdp: () => void;
    onOpenRankings: () => void;
    onOpenSeasonProjections: () => void;
    onOpenAdp: () => void;
    expanded?: boolean;
  } = $props();

  let rankingCsvText = $state("");
  let adpCsvText = $state("");
  let projectionFiles: Array<{ position: Position; csvText: string; name: string }> = $state([]);
  let selectionError = $state("");

  const loadedCount = $derived(
    Number(Boolean(rankingImportSummary)) +
      Number(Boolean(seasonProjectionImportSummary)) +
      Number(Boolean(adpImportSummary)),
  );
  const summaryText = $derived(
    hasDraft ? `${loadedCount}/3 sources loaded` : "Available after draft selection",
  );

  async function readSingleFile(event: Event, target: "rankings" | "adp") {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (target === "rankings") {
      rankingCsvText = text;
    } else {
      adpCsvText = text;
    }
  }

  async function readProjectionFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const loaded = await Promise.all(
      files.map(async (file) => ({
        file,
        csvText: await file.text(),
      })),
    );
    const classified = loaded
      .map(({ file, csvText }) => {
        const position = inferPosition(file.name, csvText);
        return position ? { position, csvText, name: file.name } : null;
      })
      .filter((file): file is { position: Position; csvText: string; name: string } => Boolean(file));
    const unique = new Map(classified.map((file) => [file.position, file]));
    projectionFiles = Array.from(unique.values()).sort(
      (left, right) => projectionOrder.indexOf(left.position) - projectionOrder.indexOf(right.position),
    );
    selectionError = classified.length === files.length
      ? ""
      : "One or more files could not be identified. Use the FantasyPros QB, RB, WR, TE, K, and DST exports.";
  }

  function inferPosition(fileName: string, csvText: string): Position | null {
    const upperName = fileName.toUpperCase();
    for (const [token, position] of filePositionTokens) {
      if (upperName.includes(token)) return position;
    }
    const header = csvText.split(/\r?\n/, 1)[0]?.toUpperCase() ?? "";
    if (header.includes('"CMP"') && header.includes('"INTS"')) return "QB";
    if (header.includes('"SACK"') && header.includes('"YDS_AGN"')) return "DEF";
    if (header.includes('"FG"') && header.includes('"FGA"')) return "K";
    return null;
  }

  function toggleExpanded() {
    if (hasDraft) expanded = !expanded;
  }

  const projectionOrder: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const filePositionTokens: Array<[string, Position]> = [
    ["_DST", "DEF"],
    ["_QB", "QB"],
    ["_RB", "RB"],
    ["_WR", "WR"],
    ["_TE", "TE"],
    ["_K.", "K"],
  ];
</script>

<section class="panel data-panel" class:disabled-panel={!hasDraft} aria-label="Draft data setup">
  <div class="section-header">
    <button class="header-toggle" type="button" onclick={toggleExpanded} aria-expanded={expanded} disabled={!hasDraft}>
      <Icon name="chevron-right" size={14} />
      <div>
        <h2><Icon name="upload" size={17} /> Draft data</h2>
        {#if !expanded}<span class="collapsed-summary">{summaryText}</span>{/if}
      </div>
    </button>
    <span class="pill" class:pill-ready={loadedCount === 3} class:pill-warning={hasDraft && loadedCount < 3}>
      {loadedCount === 3 ? "Complete" : hasDraft ? `${loadedCount}/3 loaded` : "After draft selection"}
    </span>
  </div>

  {#if expanded}
    <p class="intro">Combine expert opinion, projected production, and Sleeper draft behavior without treating them as the same signal.</p>

    <div class="source-row">
      <div class="source-heading">
        <span class="step">1</span>
        <div>
          <strong>{scoring || "Scoring-aware"} ECR</strong>
          <span>Expert ranks and tiers</span>
        </div>
        <span class="source-status" class:ready={Boolean(rankingImportSummary)}>
          {rankingImportSummary ? `${rankingImportSummary.matched} matched` : "Required"}
        </span>
      </div>
      <div class="source-actions">
        <button class="btn btn-secondary" type="button" onclick={onOpenRankings}>Open rankings <Icon name="external" size={13} /></button>
        <label class="btn btn-secondary file-button">
          Choose CSV
          <input type="file" accept=".csv,text/csv" onchange={(event) => readSingleFile(event, "rankings")} />
        </label>
        <button class="btn btn-primary" type="button" disabled={!rankingCsvText || isImportingRankings || isClearingRankings} onclick={() => onImportRankings(rankingCsvText)}>
          {isImportingRankings ? "Importing" : rankingImportSummary ? "Replace" : "Import"}
        </button>
        {#if rankingImportSummary}
          <button class="btn btn-quiet" type="button" disabled={isClearingRankings} onclick={onClearRankings}>Clear</button>
        {/if}
      </div>
      {#if rankingImportSummary}
        <span class="source-meta" class:stale={getImportFreshness(rankingImportSummary.appliedAt, 14).stale}>
          {rankingImportSummary.scoring ?? scoring} - imported {formatImportDate(rankingImportSummary)}
          ({getImportFreshness(rankingImportSummary.appliedAt, 14).label})
        </span>
      {/if}
      {#if rankingImportError}<p class="callout callout-danger"><Icon name="alert" size={15} />{rankingImportError}</p>{/if}
    </div>

    <div class="source-row">
      <div class="source-heading">
        <span class="step">2</span>
        <div>
          <strong>{season} season projections</strong>
          <span>League-scored points and replacement value</span>
        </div>
        <span class="source-status" class:ready={Boolean(seasonProjectionImportSummary)}>
          {seasonProjectionImportSummary ? `${seasonProjectionImportSummary.matched} matched` : "Recommended"}
        </span>
      </div>
      <div class="source-actions">
        <button class="btn btn-secondary" type="button" onclick={onOpenSeasonProjections}>Open projections <Icon name="external" size={13} /></button>
        <label class="btn btn-secondary file-button">
          Choose files
          <input type="file" multiple accept=".csv,text/csv" onchange={readProjectionFiles} />
        </label>
        <button
          class="btn btn-primary"
          type="button"
          disabled={projectionFiles.length === 0 || isImportingSeasonProjections || isClearingSeasonProjections}
          onclick={() => onImportSeasonProjections({ season, files: projectionFiles.map(({ position, csvText }) => ({ position, csvText })) })}
        >
          {isImportingSeasonProjections ? "Importing" : seasonProjectionImportSummary ? "Replace" : "Import"}
        </button>
        {#if seasonProjectionImportSummary}
          <button class="btn btn-quiet" type="button" disabled={isClearingSeasonProjections} onclick={onClearSeasonProjections}>Clear</button>
        {/if}
      </div>
      {#if projectionFiles.length > 0}
        <div class="position-list">
          {#each projectionFiles as file}<span>{file.position}</span>{/each}
        </div>
      {/if}
      {#if seasonProjectionImportSummary}
        <span class="source-meta" class:stale={getImportFreshness(seasonProjectionImportSummary.appliedAt, 14).stale}>
          {seasonProjectionImportSummary.positions.join(", ")} - imported {formatImportDate(seasonProjectionImportSummary)}
          ({getImportFreshness(seasonProjectionImportSummary.appliedAt, 14).label})
        </span>
      {/if}
      {#if selectionError}<p class="callout callout-warning"><Icon name="alert" size={15} />{selectionError}</p>{/if}
      {#if seasonProjectionImportError}<p class="callout callout-danger"><Icon name="alert" size={15} />{seasonProjectionImportError}</p>{/if}
      {#if seasonProjectionImportSummary?.warnings.length}
        <p class="source-warning">{seasonProjectionImportSummary.warnings[0]}</p>
      {/if}
    </div>

    <div class="source-row">
      <div class="source-heading">
        <span class="step">3</span>
        <div>
          <strong>Sleeper ADP</strong>
          <span>Market value and return probability</span>
        </div>
        <span class="source-status" class:ready={Boolean(adpImportSummary)}>
          {adpImportSummary ? `${adpImportSummary.matched} matched` : "Recommended"}
        </span>
      </div>
      <div class="source-actions">
        <button class="btn btn-secondary" type="button" onclick={onOpenAdp}>Open ADP <Icon name="external" size={13} /></button>
        <label class="btn btn-secondary file-button">
          Choose CSV
          <input type="file" accept=".csv,text/csv" onchange={(event) => readSingleFile(event, "adp")} />
        </label>
        <button class="btn btn-primary" type="button" disabled={!adpCsvText || isImportingAdp || isClearingAdp} onclick={() => onImportAdp(adpCsvText, season)}>
          {isImportingAdp ? "Importing" : adpImportSummary ? "Replace" : "Import"}
        </button>
        {#if adpImportSummary}
          <button class="btn btn-quiet" type="button" disabled={isClearingAdp} onclick={onClearAdp}>Clear</button>
        {/if}
      </div>
      {#if adpImportSummary}
        <span class="source-meta" class:stale={getImportFreshness(adpImportSummary.appliedAt, 14).stale}>
          Sleeper{adpImportSummary.includesRealTime ? " + Real-Time" : ""} - imported {formatImportDate(adpImportSummary)}
          ({getImportFreshness(adpImportSummary.appliedAt, 14).label})
        </span>
      {/if}
      {#if adpImportError}<p class="callout callout-danger"><Icon name="alert" size={15} />{adpImportError}</p>{/if}
    </div>
  {/if}
</section>

<style>
  .data-panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .disabled-panel {
    opacity: 0.85;
  }

  .section-header,
  .source-heading,
  .source-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-header {
    justify-content: space-between;
  }

  .header-toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
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

  .header-toggle h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: var(--text-lg);
  }

  .collapsed-summary,
  .source-heading span,
  .source-meta,
  .source-warning {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .intro {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .source-row {
    display: grid;
    gap: 10px;
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
  }

  .source-heading {
    align-items: flex-start;
  }

  .source-heading > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .step {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    border-radius: 50%;
    background: var(--surface-raised);
    color: var(--text-secondary) !important;
    font-size: 11px !important;
    font-weight: 800;
  }

  .source-status {
    margin-left: auto;
    color: var(--warning) !important;
    font-size: 11px !important;
    font-weight: 800;
    text-transform: uppercase;
  }

  .source-status.ready {
    color: var(--accent) !important;
  }

  .source-actions {
    flex-wrap: wrap;
  }

  .source-actions .btn {
    min-height: 34px;
  }

  .btn-quiet {
    border-color: transparent;
    background: transparent;
    color: var(--text-muted);
  }

  .file-button {
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }

  .file-button input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .position-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .position-list span {
    padding: 3px 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
  }

  .source-warning {
    margin: 0;
    line-height: 1.45;
  }

  .source-meta.stale {
    color: var(--warning);
  }

  .callout {
    margin: 0;
  }

  @media (max-width: 720px) {
    .section-header {
      align-items: flex-start;
    }

    .source-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .source-actions .btn {
      width: 100%;
    }
  }
</style>
