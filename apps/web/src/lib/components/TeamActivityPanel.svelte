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

  let expanded = $state(false);
  const recent = $derived(activitySummary?.recentTransactions.slice(0, 3) ?? []);
  const adds = $derived(activitySummary?.trendingAdds.slice(0, 4) ?? []);
  const summary = $derived(
    isLoading
      ? "Loading Sleeper activity"
      : adds[0]?.player.name
        ? `Top add: ${adds[0].player.name}`
        : activitySummary?.headline ?? "No activity loaded",
  );

  function askActivity() {
    void onAsk?.("What does recent Sleeper activity say about my roster moves?");
  }
</script>

<article class:expanded class="activity-panel">
  <button
    class="activity-summary"
    type="button"
    aria-expanded={expanded}
    aria-controls="team-market-activity-details"
    onclick={() => (expanded = !expanded)}
  >
    <span class="activity-label"><Icon name="activity" size={14} /> Market activity</span>
    <strong>{summary}</strong>
    <span class="activity-cue">{expanded ? "Hide details" : "View details"}<Icon name="chevron-right" size={14} /></span>
  </button>

  {#if expanded}
    <div class="activity-details" id="team-market-activity-details">
      <div class="details-heading">
        <div><p class="eyebrow">Sleeper activity</p><h2>Market signals</h2></div>
        {#if activitySummary}<button class="btn btn-ghost btn-sm" type="button" onclick={askActivity}>Ask Codex</button>{/if}
      </div>

      {#if isLoading}
        <p class="muted">Loading Sleeper activity...</p>
      {:else if !activitySummary}
        <p class="muted">No activity context is loaded yet.</p>
      {:else}
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
      {/if}
    </div>
  {/if}
</article>

<style>
  .activity-panel { display: grid; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
  .activity-summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; width: 100%; min-height: 44px; border: 0; padding: 9px 14px; background: transparent; color: var(--text-muted); cursor: pointer; text-align: left; transition: background var(--transition-fast); }
  .activity-summary:hover { background: var(--surface-raised); }
  .activity-label, .activity-cue { display: inline-flex; gap: 7px; align-items: center; font-size: var(--text-xs); font-weight: 800; white-space: nowrap; }
  .activity-label { color: var(--text-secondary); }
  .activity-label :global(svg) { color: var(--text-muted); }
  .activity-summary strong { overflow: hidden; color: var(--text-muted); font-size: var(--text-xs); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .activity-cue { color: var(--accent); }
  .activity-cue :global(svg) { transition: transform var(--transition-fast); }
  .expanded .activity-summary { border-bottom: 1px solid var(--border); }
  .expanded .activity-cue :global(svg) { transform: rotate(90deg); }
  .activity-details { display: grid; gap: 10px; padding: 14px 16px 16px; }
  .details-heading { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  .details-heading h2 { margin-top: 2px; font-size: var(--text-lg); }
  .muted, .summary-copy { color: var(--text-muted); font-size: var(--text-sm); line-height: 1.45; }
  .summary-copy { margin: 0; color: var(--text-secondary); }
  .compact-copy { font-size: var(--text-xs); }
  .signal-grid { display: grid; gap: 10px; }
  .signal-grid:has(section:nth-child(2)) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .signal-grid section { display: grid; gap: 7px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 9px 10px; }
  .signal-grid section > span { color: var(--text-muted); font-size: var(--text-2xs); font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
  .activity-row { display: flex; justify-content: space-between; gap: 10px; }
  .activity-row strong, .signal-grid section p { margin: 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.35; }
  .activity-row em { color: var(--text-muted); font-size: var(--text-xs); font-style: normal; white-space: nowrap; }
  @media (max-width: 720px) {
    .signal-grid:has(section:nth-child(2)) { grid-template-columns: 1fr; }
    .activity-summary { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; }
    .activity-summary strong { grid-column: 1 / -1; grid-row: 2; }
  }
</style>
