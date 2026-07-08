<script lang="ts">
  import type { TeamLineupSummary } from "../types";
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
      <button class="btn btn-ghost btn-sm" type="button" onclick={askLineup}>Ask</button>
    {/if}
  </div>

  {#if isLoading}
    <p class="muted">Loading lineup decisions...</p>
  {:else if !lineupSummary}
    <p class="muted">No lineup summary is loaded yet.</p>
  {:else}
    <p class="summary">{lineupSummary.headline}</p>

    {#if swaps.length > 0}
      <div class="alert-box">
        <strong>{swaps.length} swap{swaps.length === 1 ? "" : "s"} to review</strong>
        <span>{swaps.slice(0, 2).map((decision) => `${decision.recommendedPlayer?.name} over ${decision.currentPlayer?.name}`).join("; ")}</span>
      </div>
    {/if}

    <div class="decision-list">
      {#each decisions as decision}
        <div class="decision-row" class:needs-action={decision.status === "open" || decision.status === "swap_recommended" || decision.status === "thin"}>
          <div>
            <strong>{decision.slot}</strong>
            <span>{decision.recommendedPlayer?.name ?? "No eligible player"}</span>
          </div>
          <span class="status">{decision.status.replace("_", " ")}</span>
        </div>
      {/each}
    </div>

    <p class="muted compact-copy">Lineup decisions use ranks and roster metadata, not weekly projections.</p>
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
  .decision-row {
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

  .decision-row.needs-action .status {
    color: var(--accent);
  }

  .status {
    flex: 0 0 auto;
    font-weight: 900;
    text-transform: capitalize;
  }
</style>
