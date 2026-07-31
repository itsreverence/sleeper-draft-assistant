<script lang="ts">
  import type { DecisionSnapshot } from "../types";
  import { meaningfulStrategySnapshots } from "../strategy-history";
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

  const updates = $derived(meaningfulStrategySnapshots(snapshots));
  const earlier = $derived(updates.slice(1, 7));

  function headline(snapshot: DecisionSnapshot): string {
    return snapshot.aiStrategy?.headline ?? snapshot.headline;
  }

  function changeSummary(snapshot: DecisionSnapshot): string {
    return snapshot.aiStrategy?.plan.changeSummary
      ?? snapshot.aiStrategy?.summary
      ?? `Recommendation updated to ${snapshot.headline}.`;
  }

  function time(createdAt: string): string {
    return new Date(createdAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

{#if earlier.length > 0 || error}
  <details class="history-disclosure">
    <summary title="View earlier strategy changes">
      <Icon name="history" size={13} />
      <span>History</span>
      {#if earlier.length > 0}
        <small>{earlier.length}</small>
      {/if}
    </summary>

    <div class="history-content">
      {#if isLoading}
        <p class="history-state">Loading strategy history...</p>
      {:else if error}
        <p class="history-state history-error">{error}</p>
      {:else}
        <strong class="history-title">Earlier changes</strong>
        <ol class="timeline">
          {#each earlier as update}
            <li>
              <span class="timeline-marker" aria-hidden="true"></span>
              <div>
                <div class="timeline-heading">
                  <strong>{headline(update)}</strong>
                  <small>Pick {update.currentPick} / {time(update.createdAt)}</small>
                </div>
                <p>{changeSummary(update)}</p>
              </div>
            </li>
          {/each}
        </ol>
        {#if updates.length > earlier.length + 1}
          <p class="older-count">{updates.length - earlier.length - 1} more updates retained locally.</p>
        {/if}
      {/if}
    </div>
  </details>
{/if}

<style>
  .history-disclosure {
    position: relative;
    z-index: 6;
  }

  .history-disclosure > summary {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    list-style: none;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .history-disclosure > summary::-webkit-details-marker {
    display: none;
  }

  .history-disclosure > summary:hover,
  .history-disclosure[open] > summary {
    color: var(--text-primary);
  }

  .history-disclosure > summary:focus-visible {
    border-radius: var(--radius-sm);
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .history-disclosure > summary small {
    display: grid;
    place-items: center;
    min-width: 17px;
    height: 17px;
    border-radius: 999px;
    background: var(--surface-sunken);
    color: var(--text-secondary);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .history-content {
    position: absolute;
    top: calc(100% + 9px);
    right: 0;
    width: min(460px, calc(100vw - 48px));
    max-height: min(460px, 65vh);
    overflow-y: auto;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-md);
    padding: 14px;
    color: var(--text-primary);
  }

  .history-title {
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .timeline {
    display: grid;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }

  .timeline li {
    display: grid;
    grid-template-columns: 11px minmax(0, 1fr);
    gap: 9px;
    position: relative;
    padding-bottom: 12px;
  }

  .timeline li:not(:last-child)::before {
    content: "";
    position: absolute;
    top: 8px;
    bottom: 0;
    left: 4px;
    width: 1px;
    background: var(--accent-border);
  }

  .timeline-marker {
    width: 8px;
    height: 8px;
    margin-top: 4px;
    border: 2px solid var(--accent-soft);
    border-radius: 50%;
    background: var(--text-muted);
    box-shadow: 0 0 0 1px var(--accent-border);
    z-index: 1;
  }

  .timeline-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .timeline-heading strong {
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .timeline-heading small,
  .timeline p,
  .history-state,
  .older-count {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .timeline p {
    margin-top: 2px;
  }

  .history-state,
  .older-count {
    margin: 0;
  }

  .history-error {
    color: var(--warning);
  }

  @media (max-width: 560px) {
    .history-content {
      width: min(330px, calc(100vw - 48px));
    }

    .timeline-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }
  }
</style>
