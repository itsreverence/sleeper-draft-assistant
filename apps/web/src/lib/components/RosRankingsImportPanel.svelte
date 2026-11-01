<script lang="ts">
  import type { DraftScoringFormat, SeasonValueRankingImportSummary, TeamManagerState } from "../types";
  import { formatImportDate } from "../format";
  import { getImportFreshness } from "../freshness";
  import DataLine from "./DataLine.svelte";
  import FileInput from "./FileInput.svelte";
  import Icon from "./Icon.svelte";

  let {
    hasTeam,
    defaultSeason,
    leagueSeason,
    seasonPhase,
    currentWeek,
    scoring,
    summary,
    error,
    isImporting,
    isClearing,
    open = $bindable(false),
    onImport,
    onClear,
    onOpenFantasyPros,
    onOpenDraftFallback,
  }: {
    hasTeam: boolean;
    defaultSeason: string;
    leagueSeason: string;
    seasonPhase: TeamManagerState["seasonPhase"] | undefined;
    currentWeek: number;
    scoring: DraftScoringFormat;
    summary: SeasonValueRankingImportSummary | null;
    error: string;
    isImporting: boolean;
    isClearing: boolean;
    open?: boolean;
    onImport: (input: { season: string; scoring: DraftScoringFormat; csvText: string }) => void;
    onClear: (input: { season: string; scoring: DraftScoringFormat }) => void;
    onOpenFantasyPros: () => void;
    onOpenDraftFallback: () => void;
  } = $props();

  let season = $state("");
  let csvText = $state("");
  let csvName = $state("");

  $effect(() => {
    if (!season && defaultSeason) season = defaultSeason;
  });

  const mismatch = $derived(Boolean(summary && leagueSeason && summary.season !== leagueSeason));
  const freshness = $derived(summary ? getImportFreshness(summary.appliedAt, 7) : null);
  const isFallback = $derived(summary?.rankingType === "draft-ecr-fallback");
  const needsRosUpdate = $derived(Boolean(isFallback && seasonPhase === "regular" && currentWeek >= 2));
  const sourceLabel = $derived(summary?.rankingType === "ros-ecr" ? "ROS ECR" : "Draft ECR fallback");
  const lineSummary = $derived.by(() => {
    if (!summary) return hasTeam ? "Not imported · long-term waiver and roster value" : "Available after team load";
    if (mismatch) return `Saved for ${summary.season} · not used by advice`;
    if (needsRosUpdate) return `${sourceLabel} · ${summary.matched} matched · ROS update recommended`;
    return `${sourceLabel} · ${summary.matched} matched · ${summary.season} ${summary.scoring}`;
  });

  async function readFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    csvText = await file.text();
    csvName = file.name;
  }
</script>

<DataLine name="season-value" title="Season value rankings" summary={lineSummary} warn={mismatch || needsRosUpdate || Boolean(!isFallback && freshness?.stale) || Boolean(error)} bind:open>
  <p class="source-purpose">
    Weekly projections answer who helps now. ROS ECR is preferred; draft ECR is a fallback through Week 1.
  </p>

  {#if needsRosUpdate}
    <p class="callout callout-warning"><Icon name="alert" size={15} />ROS update recommended. Draft ECR fallback is still active.</p>
  {/if}

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
      Open ROS ECR <Icon name="external" size={13} />
    </button>
    <button class="btn btn-secondary" type="button" disabled={!hasTeam} onclick={onOpenDraftFallback}>
      Open Draft ECR <Icon name="external" size={13} />
    </button>
    {#if summary && summary.rankingOrigin !== "draft-import"}
      <button class="btn btn-ghost" type="button" disabled={isClearing || isImporting} onclick={() => onClear({ season: summary.season, scoring: summary.scoring })}>
        {isClearing ? "Clearing" : "Clear"}
      </button>
    {/if}
  </div>

  <FileInput
    label="Choose CSV"
    selection={csvName || "No file selected"}
    disabled={!hasTeam || isImporting || isClearing}
    onchange={readFile}
  />

  <button
    class="btn btn-primary btn-block"
    type="button"
    disabled={!hasTeam || !csvText || isImporting || isClearing}
    onclick={() => onImport({ season: season.trim(), scoring, csvText })}
  >
    {isImporting ? "Importing" : summary ? "Replace season value rankings" : "Import season value rankings"}
  </button>

  {#if summary}
    <p class="import-status" class:stale={!isFallback && freshness?.stale}>
      {summary.matched}/{summary.rowsParsed} matched, saved {formatImportDate(summary)}.
      {#if summary.rankingOrigin === "draft-import"}Reused from the connected draft.{:else if !isFallback}{freshness?.label}.{/if}
      {#if summary.unmatched.length > 0 || summary.ambiguous.length > 0}
        Review: {summary.unmatched.length} unmatched, {summary.ambiguous.length} ambiguous.
      {/if}
    </p>
  {/if}

  {#if error}
    <p class="callout callout-danger"><Icon name="alert" size={15} />{error}</p>
  {/if}
</DataLine>

<style>
  .import-status,
  .source-purpose {
    color: var(--text-secondary);
    font-size: var(--text-xs);
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
  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  @media (max-width: 760px) {
    .control-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
