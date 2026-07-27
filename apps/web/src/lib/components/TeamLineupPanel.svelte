<script lang="ts">
  import type { TeamLineupSummary } from "../types";
  import { formatWeeklyProjection } from "../format";
  import Icon from "./Icon.svelte";

  let {
    lineupSummary,
    isLoading = false,
    onAsk,
  }: {
    lineupSummary: TeamLineupSummary | null;
    isLoading?: boolean;
    onAsk?: (question: string) => void | Promise<void>;
  } = $props();

  const decisions = $derived(lineupSummary?.decisions.slice(0, 6) ?? []);
  const swaps = $derived(lineupSummary?.swapRecommendations ?? []);
  const hasWeeklyProjections = $derived(
    decisions.some((decision) => decision.recommendedPlayer?.projectionSource === "weekly_projection" || decision.currentPlayer?.projectionSource === "weekly_projection"),
  );
  const currentCoverage = $derived(Math.round((lineupSummary?.currentProjectionCoverage ?? 0) * 100));
  const recommendedCoverage = $derived(Math.round((lineupSummary?.recommendedProjectionCoverage ?? 0) * 100));

  function askLineup() {
    void onAsk?.("Who should I start this week?");
  }
</script>

<article class="panel lineup-panel">
    <div class="panel-heading compact">
    <div>
      <p class="eyebrow">Lineup</p>
      <h2><Icon name="clipboard" size={17} /> Decisions</h2>
    </div>
      {#if lineupSummary}
        <div class="heading-actions">
          <span class="pill" class:pill-ready={lineupSummary.confidence === "high"} class:pill-warning={lineupSummary.confidence !== "high"}>
            {lineupSummary.confidence} confidence
          </span>
          <button class="btn btn-ghost btn-sm" type="button" onclick={askLineup}>Ask</button>
        </div>
      {/if}
  </div>

  {#if isLoading}
    <p class="muted">Loading lineup decisions...</p>
  {:else if !lineupSummary}
    <p class="muted">No lineup summary is loaded yet.</p>
  {:else}
    <p class="summary">{lineupSummary.headline}</p>

    <div class="projection-summary">
      <div>
        <span>Current</span>
        <strong>{lineupSummary.currentProjectedPoints === null ? `${currentCoverage}% covered` : lineupSummary.currentProjectedPoints.toFixed(1)}</strong>
      </div>
      <div>
        <span>Optimized</span>
        <strong>{lineupSummary.recommendedProjectedPoints === null ? `${recommendedCoverage}% covered` : lineupSummary.recommendedProjectedPoints.toFixed(1)}</strong>
      </div>
      <div class:positive={(lineupSummary.projectedPointDelta ?? 0) > 0}>
        <span>Projected gain</span>
        <strong>{lineupSummary.projectedPointDelta === null ? "Incomplete" : `${lineupSummary.projectedPointDelta >= 0 ? "+" : ""}${lineupSummary.projectedPointDelta.toFixed(1)}`}</strong>
      </div>
    </div>

    {#if swaps.length > 0}
      <div class="alert-box">
        <strong>{swaps.length} swap{swaps.length === 1 ? "" : "s"} to review</strong>
        <span>
          {swaps.slice(0, 2).map((decision) =>
            `${decision.recommendedPlayer?.name} over ${decision.currentPlayer?.name}${decision.projectedPointDelta === null ? "" : ` (+${decision.projectedPointDelta.toFixed(1)})`}`,
          ).join("; ")}
        </span>
      </div>
    {/if}

    <div class="decision-list">
      {#each decisions as decision}
        <div class="decision-row" class:needs-action={decision.status === "open" || decision.status === "swap_recommended" || decision.status === "thin"}>
          <div>
            <strong>{decision.slot}</strong>
            <span>
              {#if decision.status === "swap_recommended" && decision.currentPlayer}
                {decision.currentPlayer.name} <b>to</b> {decision.recommendedPlayer?.name}
              {:else}
                {decision.recommendedPlayer?.name ?? "No eligible player"}
              {/if}
              {#if decision.projectedPointDelta !== null && decision.status === "swap_recommended"}
                <small>+{decision.projectedPointDelta.toFixed(1)} pts</small>
              {:else if formatWeeklyProjection(decision.recommendedPlayer)}
                <small>{formatWeeklyProjection(decision.recommendedPlayer)}</small>
              {/if}
            </span>
          </div>
          <span class="status">
            {decision.status.replace("_", " ")}
            <small>{decision.confidence}</small>
          </span>
        </div>
      {/each}
    </div>

    <p class="muted compact-copy">
      {hasWeeklyProjections
        ? "Lineup decisions use imported weekly projections when available, plus ranks and roster metadata."
        : "Lineup decisions use ranks and roster metadata, not weekly projections."}
    </p>
  {/if}
</article>

<style>
  .lineup-panel {
    display: grid;
    gap: 10px;
  }

  .muted,
  .summary {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .summary {
    color: var(--text-secondary);
    margin: 0;
  }

  .compact-copy {
    font-size: var(--text-xs);
  }

  .alert-box,
  .decision-row,
  .projection-summary {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 9px 10px;
  }

  .alert-box {
    display: grid;
    gap: 3px;
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .heading-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .projection-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 0;
    overflow: hidden;
  }

  .projection-summary div {
    padding: 9px 10px;
    border-right: 1px solid var(--border);
  }

  .projection-summary div:last-child {
    border-right: 0;
  }

  .projection-summary span,
  .projection-summary strong {
    display: block;
  }

  .projection-summary span {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .projection-summary strong {
    margin-top: 3px;
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .projection-summary .positive strong {
    color: var(--accent);
  }

  .alert-box strong {
    color: var(--warning);
    font-size: var(--text-sm);
  }

  .alert-box span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .decision-list {
    display: grid;
    gap: 7px;
  }

  .decision-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .decision-row div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .decision-row strong {
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .decision-row span {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .decision-row b {
    color: var(--text-muted);
    font-weight: 700;
  }

  .decision-row small {
    margin-left: 6px;
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 900;
  }

  .decision-row.needs-action .status {
    color: var(--accent);
  }

  .status {
    display: grid;
    gap: 2px;
    flex: 0 0 auto;
    font-weight: 900;
    text-align: right;
    text-transform: capitalize;
  }

  .status small {
    color: var(--text-muted);
    font-size: 8px;
    text-transform: uppercase;
  }

  @media (max-width: 560px) {
    .projection-summary {
      grid-template-columns: 1fr;
    }

    .projection-summary div {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }

    .projection-summary div:last-child {
      border-bottom: 0;
    }
  }
</style>
