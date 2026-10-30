<script lang="ts">
  import type { AiDraftStrategyPayload, DecisionSnapshot } from "../types";
  import DecisionHistoryPanel from "./DecisionHistoryPanel.svelte";

  let {
    strategy,
    history = [],
    isLoadingHistory = false,
    historyError = "",
    detailsOpen = false,
  }: {
    strategy: AiDraftStrategyPayload;
    history?: DecisionSnapshot[];
    isLoadingHistory?: boolean;
    historyError?: string;
    detailsOpen?: boolean;
  } = $props();

  const plan = $derived(strategy.decision.plan);
  const changeSummary = $derived(plan.changeSummary.trim());
  const showChangeSummary = $derived(
    Boolean(changeSummary) && !/^no material change\b/i.test(changeSummary),
  );
</script>

<article class="strategy-panel">
  <DecisionHistoryPanel
    snapshots={history}
    isLoading={isLoadingHistory}
    error={historyError}
  />

  <p class="strategy-approach">{plan.approach}</p>

  <details class="strategy-details" open={detailsOpen}>
    <summary>Plan details</summary>
    <div class="strategy-details-content">
      {#if showChangeSummary}
        <div class="strategy-section">
          <strong>Latest adjustment</strong>
          <p>{changeSummary}</p>
        </div>
      {/if}
      <div class="strategy-section">
        <strong>Roster goals</strong>
        <ul>
          {#each plan.rosterGoals as goal}
            <li>{goal}</li>
          {/each}
        </ul>
      </div>
      {#if plan.watchItems.length > 0}
        <div class="strategy-section">
          <strong>Watching</strong>
          <ul>
            {#each plan.watchItems as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </details>
</article>

<style>
  .strategy-panel {
    display: grid;
    gap: 14px;
  }

  .strategy-approach,
  .strategy-section p,
  .strategy-section ul {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .strategy-details {
    border-top: 1px solid var(--border);
    padding-top: 11px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .strategy-details > summary {
    cursor: pointer;
    font-weight: 700;
  }

  .strategy-details[open] > summary {
    color: var(--text-primary);
  }

  .strategy-details-content {
    display: grid;
    gap: 14px;
    padding-top: 12px;
  }

  .strategy-section {
    display: grid;
    gap: 6px;
  }

  .strategy-section + .strategy-section {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }

  .strategy-section > strong {
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .strategy-section ul {
    padding-left: 17px;
  }

</style>
