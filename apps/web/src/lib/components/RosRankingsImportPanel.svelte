<script lang="ts">
  import type { DraftScoringFormat, RosRankingImportSummary } from "../types";
  import { formatImportDate } from "../format";
  import { getImportFreshness } from "../freshness";
  import Icon from "./Icon.svelte";

  let {
    hasTeam,
    defaultSeason,
    leagueSeason,
    scoring,
    summary,
    weeklyLoaded,
    error,
    isImporting,
    isClearing,
    onImport,
    onClear,
    onOpenFantasyPros,
  }: {
    hasTeam: boolean;
    defaultSeason: string;
    leagueSeason: string;
    scoring: DraftScoringFormat;
    summary: RosRankingImportSummary | null;
    weeklyLoaded: boolean;
    error: string;
    isImporting: boolean;
    isClearing: boolean;
    onImport: (input: { season: string; scoring: DraftScoringFormat; csvText: string }) => void;
    onClear: (input: { season: string; scoring: DraftScoringFormat }) => void;
    onOpenFantasyPros: () => void;
  } = $props();

  let season = $state("");
  let csvText = $state("");

  $effect(() => {
    if (!season && defaultSeason) season = defaultSeason;
  });

  const sourceCount = $derived(Number(Boolean(summary)) + Number(weeklyLoaded));
  const mismatch = $derived(Boolean(summary && leagueSeason && summary.season !== leagueSeason));
  const freshness = $derived(summary ? getImportFreshness(summary.appliedAt, 7) : null);

  async function readFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) csvText = await file.text();
  }
</script>

<article class="panel ros-import-panel" class:disabled-panel={!hasTeam}>
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">Team data</p>
      <h2><Icon name="upload" size={17} /> Rest-of-season rankings</h2>
      <span class="collapsed-summary">
        {summary ? `${summary.matched} matched - ${summary.season} ${summary.scoring}` : "Long-term waiver and roster value"}
      </span>
    </div>
    <span class="pill" class:pill-ready={sourceCount === 2} class:pill-warning={hasTeam && sourceCount < 2}>
      {hasTeam ? `${sourceCount}/2 sources` : "After team load"}
    </span>
  </div>

  <p class="source-purpose">
    Weekly projections answer who helps now. Overall ROS ECR protects long-term add, drop, and stash decisions.
  </p>

  {#if mismatch && summary}
    <p class="callout callout-warning">
      <Icon name="alert" size={15} />
      Saved rankings are for {summary.season}; this league is {leagueSeason}. They remain stored but do not affect advice.
    </p>
  {/if}

  <div class="control-grid">
    <label class="field">
      <span>Season</span>
      <input class="input" bind:value={season} placeholder="2026" disabled={!hasTeam || isImporting || isClearing} />
    </label>
    <div class="field">
      <span>Scoring</span>
      <div class="input static-value">{scoring}</div>
    </div>
  </div>

  <div class="action-row">
    <button class="btn btn-secondary" type="button" disabled={!hasTeam} onclick={onOpenFantasyPros}>
      Open FantasyPros <Icon name="external" size={13} />
    </button>
    <label class="btn btn-secondary file-button">
      Choose CSV
      <input type="file" accept=".csv,text/csv" disabled={!hasTeam || isImporting || isClearing} onchange={readFile} />
    </label>
    {#if summary}
      <button class="btn btn-quiet" type="button" disabled={isClearing || isImporting} onclick={() => onClear({ season: summary.season, scoring: summary.scoring })}>
        {isClearing ? "Clearing" : "Clear"}
      </button>
    {/if}
  </div>

  <button
    class="btn btn-primary btn-block"
    type="button"
    disabled={!hasTeam || !csvText || isImporting || isClearing}
    onclick={() => onImport({ season: season.trim(), scoring, csvText })}
  >
    {isImporting ? "Importing" : summary ? "Replace ROS rankings" : "Import ROS rankings"}
  </button>

  {#if summary}
    <p class="import-status" class:stale={freshness?.stale}>
      {summary.matched}/{summary.rowsParsed} matched, saved {formatImportDate(summary)}.
      {freshness?.label}.
      {#if summary.unmatched.length > 0 || summary.ambiguous.length > 0}
        Review: {summary.unmatched.length} unmatched, {summary.ambiguous.length} ambiguous.
      {/if}
    </p>
  {/if}

  {#if error}
    <p class="callout callout-danger"><Icon name="alert" size={15} />{error}</p>
  {/if}
</article>

<style>
  .ros-import-panel {
    display: grid;
    gap: 10px;
  }
  .disabled-panel {
    opacity: 0.85;
  }
  .collapsed-summary,
  .import-status,
  .source-purpose {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .collapsed-summary {
    display: block;
    margin-top: 4px;
    font-weight: 700;
  }
  .source-purpose,
  .import-status {
    margin: 0;
    line-height: 1.55;
  }
  .import-status.stale {
    color: var(--warning);
  }
  .control-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .static-value {
    display: flex;
    align-items: center;
  }
  .file-button {
    position: relative;
    overflow: hidden;
  }
  .file-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  @media (max-width: 700px) {
    .control-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
