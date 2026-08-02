<script lang="ts">
  import type { AiDraftStrategyPayload, DecisionSnapshot } from "../types";
  import DecisionHistoryPanel from "./DecisionHistoryPanel.svelte";
  import Icon from "./Icon.svelte";

  let {
    strategy,
    history = [],
    isLoadingHistory = false,
    historyError = "",
  }: {
    strategy: AiDraftStrategyPayload;
    history?: DecisionSnapshot[];
    isLoadingHistory?: boolean;
    historyError?: string;
  } = $props();

  const plan = $derived(strategy.decision.plan);
  const changeSummary = $derived(plan.changeSummary.trim());
  const showChangeSummary = $derived(
    Boolean(changeSummary) && !/^no material change\b/i.test(changeSummary),
  );
</script>

<article class="panel strategy-panel">
  <div class="strategy-heading">
    <div>
      <h2><Icon name="clipboard" size={17} /> Draft strategy</h2>
      <span>Updated at pick {plan.updatedAtPick}</span>
    </div>
    <DecisionHistoryPanel
      snapshots={history}
      isLoading={isLoadingHistory}
      error={historyError}
    />
  </div>

  <div class="strategy-priorities">
    <div>
      <span>Next turn</span>
      <strong>{plan.nextTurnPriorities.join(" / ") || "Reassess board"}</strong>
    </div>
    <div>
      <span>Can wait</span>
      <strong>{plan.positionsThatCanWait.join(" / ") || "Nothing identified"}</strong>
    </div>
  </div>

  <p class="strategy-approach">{plan.approach}</p>

  <details class="strategy-details">
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
    padding: var(--space-4);
  }

  .strategy-heading,
  .strategy-heading > div {
    display: flex;
    align-items: center;
  }

  .strategy-heading {
    justify-content: space-between;
    gap: 12px;
  }

  .strategy-heading > div {
    min-width: 0;
    flex-wrap: wrap;
    gap: 4px 8px;
  }

  .strategy-heading h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-lg);
  }

  .strategy-heading span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .strategy-priorities {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-block: 1px solid var(--border);
  }

  .strategy-priorities > div {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 9px 8px;
  }

  .strategy-priorities > div + div {
    border-left: 1px solid var(--border);
  }

  .strategy-priorities span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .strategy-priorities strong {
    overflow-wrap: anywhere;
    color: var(--text-primary);
    font-size: var(--text-sm);
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
    font-weight: 800;
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

  @media (max-width: 360px) {
    .strategy-priorities {
      grid-template-columns: 1fr;
    }

    .strategy-priorities > div + div {
      border-top: 1px solid var(--border);
      border-left: 0;
    }
  }
</style>
