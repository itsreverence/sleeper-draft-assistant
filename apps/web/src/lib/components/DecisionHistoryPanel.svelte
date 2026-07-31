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
  const latest = $derived(updates[0] ?? null);
  const earlier = $derived(updates.slice(1, 6));

  function headline(snapshot: DecisionSnapshot): string {
    return snapshot.aiStrategy?.headline ?? snapshot.headline;
  }

  function changeSummary(snapshot: DecisionSnapshot): string {
    return snapshot.aiStrategy?.plan.changeSummary
      ?? snapshot.aiStrategy?.summary
      ?? `Recommendation updated to ${snapshot.headline}.`;
  }

  function positions(values: string[]): string {
    return values.length > 0 ? values.join(" / ") : "Best available value";
  }

  function time(createdAt: string): string {
    return new Date(createdAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<details class="panel history-panel">
  <summary>
    <span><Icon name="history" size={16} /> Strategy updates</span>
    <small>{updates.length === 1 ? "1 meaningful change" : updates.length > 1 ? `${updates.length} meaningful changes` : "No updates yet"}</small>
  </summary>

  {#if isLoading}
    <p class="panel-state">Loading strategy updates...</p>
  {:else if error}
    <p class="callout callout-warning panel-callout">{error}</p>
  {:else if latest}
    <section class="latest-update" aria-label="Latest strategy update">
      <div class="update-meta">
        <span class="eyebrow">Latest update</span>
        <span class="confidence">{latest.confidence} confidence</span>
      </div>
      <div class="update-title">
        <strong>{headline(latest)}</strong>
        <small>Pick {latest.currentPick} / {time(latest.createdAt)}</small>
      </div>
      <p class="change-summary">{changeSummary(latest)}</p>

      {#if latest.aiStrategy}
        <p class="approach">{latest.aiStrategy.plan.approach}</p>
        <dl class="plan-summary">
          <div>
            <dt>Focus now</dt>
            <dd>{positions(latest.aiStrategy.plan.currentPickFocus)}</dd>
          </div>
          <div>
            <dt>Next turn</dt>
            <dd>{positions(latest.aiStrategy.plan.nextTurnPriorities)}</dd>
          </div>
          <div>
            <dt>Can wait</dt>
            <dd>{positions(latest.aiStrategy.plan.positionsThatCanWait)}</dd>
          </div>
        </dl>
      {:else}
        <p class="legacy-note">This older snapshot predates structured strategy history.</p>
      {/if}
    </section>

    {#if earlier.length > 0}
      <section class="timeline-section" aria-labelledby="earlier-strategy-updates">
        <h3 id="earlier-strategy-updates">Earlier changes</h3>
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
          <p class="older-count">{updates.length - earlier.length - 1} earlier updates retained locally.</p>
        {/if}
      </section>
    {/if}
  {:else}
    <p class="panel-state">Meaningful strategy changes will appear after AI draft analysis runs.</p>
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
  .update-title small,
  .timeline-heading small,
  .panel-state,
  .legacy-note,
  .older-count {
    color: var(--text-muted);
  }

  .latest-update,
  .timeline-section {
    border-top: 1px solid var(--border);
    margin: 0 16px;
    padding: 16px 0;
  }

  .update-meta,
  .update-title,
  .timeline-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .confidence {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: capitalize;
  }

  .update-title {
    margin-top: 6px;
  }

  .update-title strong {
    font-size: var(--text-base);
  }

  .change-summary,
  .approach,
  .timeline p {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.55;
  }

  .change-summary {
    margin-top: 8px;
    color: var(--text-primary);
  }

  .approach {
    margin-top: 5px;
  }

  .plan-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 14px;
    border-block: 1px solid var(--border);
  }

  .plan-summary div {
    min-width: 0;
    padding: 10px 12px 10px 0;
  }

  .plan-summary div + div {
    border-left: 1px solid var(--border);
    padding-left: 12px;
  }

  .plan-summary dt {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .plan-summary dd {
    margin: 3px 0 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 800;
  }

  .timeline-section h3 {
    font-size: var(--text-sm);
  }

  .timeline {
    display: grid;
    gap: 0;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }

  .timeline li {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr);
    gap: 10px;
    position: relative;
    padding: 0 0 14px;
  }

  .timeline li:not(:last-child)::before {
    content: "";
    position: absolute;
    top: 9px;
    bottom: -1px;
    left: 4px;
    width: 1px;
    background: var(--border);
  }

  .timeline-marker {
    width: 9px;
    height: 9px;
    margin-top: 5px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--text-muted);
    box-shadow: 0 0 0 1px var(--border-strong);
    z-index: 1;
  }

  .timeline-heading strong {
    font-size: var(--text-xs);
  }

  .timeline p {
    margin-top: 3px;
  }

  .panel-state,
  .panel-callout,
  .legacy-note,
  .older-count {
    margin: 0 16px 16px;
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    summary,
    .update-meta,
    .update-title,
    .timeline-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }

    .plan-summary {
      grid-template-columns: 1fr;
    }

    .plan-summary div {
      padding: 9px 0;
    }

    .plan-summary div + div {
      border-top: 1px solid var(--border);
      border-left: 0;
      padding-left: 0;
    }
  }
</style>
