<script lang="ts">
  import type { DecisionSnapshot } from "../types";
  import Icon from "./Icon.svelte";

  let {
    snapshots = [],
    isLoading = false,
    error = "",
  }: {
    snapshots?: DecisionSnapshot[];
    isLoading?: boolean;
    error?: string;
  } = $props();

  const latest = $derived(snapshots[0] ?? null);
  const previousDifferent = $derived(
    latest
      ? snapshots.slice(1).find((snapshot) => snapshot.recommendedPlayerId !== latest.recommendedPlayerId) ?? null
      : null,
  );

  function triggerLabel(trigger: DecisionSnapshot["trigger"]): string {
    const labels: Record<DecisionSnapshot["trigger"], string> = {
      "state-load": "draft opened",
      "rankings-import": "rankings updated",
      "rankings-clear": "rankings cleared",
      "manual-refresh": "recommendation refreshed",
      "ai-question": "manager asked",
      "pick-update": "pick recorded",
    };
    return labels[trigger];
  }
</script>

<details class="panel history-panel">
  <summary>
    <span><Icon name="history" size={16} /> Recent decisions</span>
    <small>{snapshots.length > 0 ? `${snapshots.length} saved` : "No snapshots yet"}</small>
  </summary>

  {#if isLoading}
    <p class="muted">Loading recommendation history...</p>
  {:else if error}
    <p class="callout callout-warning">{error}</p>
  {:else if latest}
    <div class="latest">
      <span class="eyebrow">Latest at pick {latest.currentPick}</span>
      <strong>{latest.headline}</strong>
      <small>{triggerLabel(latest.trigger)} · {new Date(latest.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
    </div>
    {#if previousDifferent}
      <p class="change">
        Changed from <strong>{previousDifferent.headline}</strong> after {triggerLabel(latest.trigger)}.
      </p>
    {:else}
      <p class="change">The saved recommendation has not changed across recent snapshots.</p>
    {/if}
    <ol>
      {#each latest.context.topCandidates.slice(0, 3) as candidate}
        <li>
          <span>{candidate.name} · {candidate.position}</span>
          <strong>{candidate.score.toFixed(1)}</strong>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="muted">Snapshots appear when the draft loads, picks change, data is imported, or advice is requested.</p>
  {/if}
</details>

<style>
  .history-panel {
    padding: 0;
    overflow: hidden;
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary span {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
  }
  summary small,
  .latest small,
  .muted {
    color: var(--text-muted);
  }
  .latest,
  .change,
  ol,
  details > .muted,
  details > .callout {
    margin: 0 16px 14px;
  }
  .latest {
    display: grid;
    gap: 4px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  .latest strong {
    font-size: var(--text-sm);
  }
  .change {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.5;
  }
  ol {
    display: grid;
    gap: 6px;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }
  li strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
</style>
