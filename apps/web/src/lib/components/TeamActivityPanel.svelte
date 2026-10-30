<script lang="ts">
  import type { TeamActivitySummary } from "../types";
  import Icon from "./Icon.svelte";

  let {
    activitySummary,
    onAsk,
  }: {
    activitySummary: TeamActivitySummary | null;
    onAsk?: (question: string) => void | Promise<void>;
  } = $props();

  let expanded = $state(false);
  const recent = $derived(activitySummary?.recentTransactions.slice(0, 3) ?? []);
  const adds = $derived(activitySummary?.trendingAdds.slice(0, 4) ?? []);
  const hasActivity = $derived(recent.length > 0 || adds.length > 0 || Boolean(activitySummary?.trendingDrops.length));
  const summary = $derived([
    ...recent.slice(0, 2).map((transaction) => transaction.description),
    ...(adds[0] ? [`Top add: ${adds[0].player.name}`] : []),
  ].join(" · ") || activitySummary?.headline || "");

  function askActivity() {
    void onAsk?.("What does recent Sleeper activity say about my roster moves?");
  }
</script>

{#if hasActivity && activitySummary}
  <article class:expanded class="activity-panel">
    <button
      class="activity-summary"
      type="button"
      title={summary}
      aria-expanded={expanded}
      aria-controls={expanded ? "team-market-activity-details" : undefined}
      onclick={() => (expanded = !expanded)}
    >
      <span class="activity-label">Market activity</span>
      <span class="activity-line">{summary}</span>
      <span class="activity-cue">{expanded ? "Hide details" : "View details"}<Icon name="chevron-right" size={12} /></span>
    </button>

    {#if expanded}
      <div class="activity-details" id="team-market-activity-details">
        <div class="details-heading">
          <h2>Market signals</h2>
          <button class="btn btn-ghost btn-sm" type="button" aria-label="Ask Assistant about market activity" onclick={askActivity}>Ask Assistant</button>
        </div>
        <p class="summary-copy">{activitySummary.headline}</p>
        <div class="signal-grid">
          {#if adds.length > 0}
            <section>
              <span>Trending adds</span>
              {#each adds as item}
                <div class="activity-row"><strong>{item.player.name}</strong><em>{item.player.team} {item.player.position}{item.count !== null ? ` · ${item.count}` : ""}</em></div>
              {/each}
            </section>
          {/if}
          {#if recent.length > 0}
            <section>
              <span>League transactions</span>
              {#each recent as transaction}<p>{transaction.description}</p>{/each}
            </section>
          {/if}
        </div>
        <p class="muted compact-copy">Trending counts are global Sleeper activity, not projections.</p>
      </div>
    {/if}
  </article>
{/if}

<style>
  .activity-panel { display: grid; min-width: 0; }
  .activity-summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; width: 100%; min-height: 36px; border: 0; border-radius: var(--radius-sm); padding: var(--space-1) var(--space-2); background: transparent; color: var(--text-muted); cursor: pointer; text-align: left; transition: background var(--transition-fast); }
  .activity-summary:hover { background: var(--surface-raised); }
  .activity-label { color: var(--text-muted); font-size: var(--text-sm); font-weight: 500; white-space: nowrap; }
  .activity-line { overflow: hidden; color: var(--text-secondary); font-size: var(--text-md); text-overflow: ellipsis; white-space: nowrap; }
  .activity-cue { display: inline-flex; gap: 2px; align-items: center; color: var(--text-secondary); font-size: var(--text-sm); font-weight: 500; white-space: nowrap; }
  .activity-cue :global(svg) { transition: transform var(--transition-fast); }
  .expanded .activity-cue :global(svg) { transform: rotate(90deg); }
  .activity-details { display: grid; gap: var(--space-3); margin-top: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); padding: var(--space-4); }
  .details-heading { display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; }
  .details-heading h2 { font-size: var(--text-lg); }
  .muted, .summary-copy { color: var(--text-muted); font-size: var(--text-sm); line-height: 1.45; }
  .summary-copy { color: var(--text-secondary); }
  .signal-grid { display: grid; gap: var(--space-3); }
  .signal-grid:has(section:nth-child(2)) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .signal-grid section { display: grid; align-content: start; gap: var(--space-2); }
  .signal-grid section > span { color: var(--text-muted); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .activity-row { display: flex; justify-content: space-between; gap: var(--space-3); }
  .activity-row strong, .signal-grid section p { color: var(--text-secondary); font-size: var(--text-sm); font-weight: 500; line-height: 1.35; }
  .activity-row em { color: var(--text-muted); font-size: var(--text-sm); font-style: normal; white-space: nowrap; }
  @media (max-width: 760px) {
    .signal-grid:has(section:nth-child(2)) { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    .activity-summary { grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--space-3); }
    .activity-line { grid-column: 1 / -1; grid-row: 2; }
  }
</style>
