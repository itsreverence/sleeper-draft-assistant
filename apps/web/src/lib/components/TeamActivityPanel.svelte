<script lang="ts">
  import type { TeamActivitySummary } from "../types";
  import Icon from "./Icon.svelte";

  let {
    activitySummary,
    isLoading = false,
    onAsk,
  }: {
    activitySummary: TeamActivitySummary | null;
    isLoading?: boolean;
    onAsk?: (question: string) => void | Promise<void>;
  } = $props();

  const recent = $derived(activitySummary?.recentTransactions.slice(0, 3) ?? []);
  const adds = $derived(activitySummary?.trendingAdds.slice(0, 4) ?? []);

  function askActivity() {
    void onAsk?.("What does recent Sleeper activity say about my roster moves?");
  }
</script>

<article class="panel activity-panel">
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">Activity</p>
      <h2><Icon name="activity" size={17} /> Market signals</h2>
    </div>
    {#if activitySummary}
      <button class="btn btn-ghost btn-sm" type="button" onclick={askActivity}>Ask</button>
    {/if}
  </div>

  {#if isLoading}
    <p class="muted">Loading Sleeper activity...</p>
  {:else if !activitySummary}
    <p class="muted">No activity context is loaded yet.</p>
  {:else}
    <p class="summary">{activitySummary.headline}</p>

    {#if adds.length > 0}
      <div class="activity-section">
        <span>Trending adds</span>
        {#each adds as item}
          <div class="activity-row">
            <strong>{item.player.name}</strong>
            <em>{item.player.team} {item.player.position}{item.count !== null ? ` - ${item.count}` : ""}</em>
          </div>
        {/each}
      </div>
    {/if}

    {#if recent.length > 0}
      <div class="activity-section">
        <span>League transactions</span>
        {#each recent as transaction}
          <p>{transaction.description}</p>
        {/each}
      </div>
    {/if}

    <p class="muted compact-copy">Trending counts are global Sleeper activity, not projections.</p>
  {/if}
</article>

<style>
  .activity-panel {
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

  .activity-section {
    display: grid;
    gap: 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 10px;
  }

  .activity-section > span {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .activity-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .activity-row strong,
  .activity-section p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.35;
  }

  .activity-row em {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-style: normal;
    white-space: nowrap;
  }
</style>
