<script lang="ts">
  import type { TeamWaiverSummary } from "../types";
  import Icon from "./Icon.svelte";

  let {
    waiverSummary,
    isLoading = false,
    onAsk,
  }: {
    waiverSummary: TeamWaiverSummary | null;
    isLoading?: boolean;
    onAsk?: (question: string) => void | Promise<void>;
  } = $props();

  const topCandidates = $derived(waiverSummary?.candidates.slice(0, 4) ?? []);
  const topDrops = $derived(waiverSummary?.dropCandidates.slice(0, 3) ?? []);

  function askWaivers() {
    void onAsk?.("Who should I add or drop from the available players?");
  }
</script>

<article class="panel waiver-panel">
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">Waivers</p>
      <h2><Icon name="plus" size={17} /> Available options</h2>
    </div>
    {#if waiverSummary}
      <button class="btn btn-ghost btn-sm" type="button" onclick={askWaivers}>Ask</button>
    {/if}
  </div>

  {#if isLoading}
    <p class="muted">Loading available players...</p>
  {:else if !waiverSummary || waiverSummary.candidates.length === 0}
    <p class="muted">No waiver candidates are available yet. Import rankings and load a Sleeper league to improve add/drop signals.</p>
  {:else}
    <p class="summary">{waiverSummary.headline}</p>
    <div class="candidate-list">
      {#each topCandidates as candidate}
        <div class="candidate-row">
          <div>
            <strong>{candidate.player.name}</strong>
            <span>{candidate.player.team} {candidate.player.position} · {candidate.valueLabel}</span>
          </div>
          <span class="score">{candidate.score.toFixed(0)}</span>
        </div>
      {/each}
    </div>

    {#if topDrops.length > 0}
      <div class="drop-box">
        <span>Potential drops</span>
        <p>{topDrops.map((candidate) => `${candidate.player.name} (${candidate.player.position})`).join(", ")}</p>
      </div>
    {/if}

    <p class="muted compact-copy">Availability is inferred from players not on Sleeper rosters. This is not transaction automation.</p>
  {/if}
</article>

<style>
  .waiver-panel {
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

  .candidate-list {
    display: grid;
    gap: 8px;
  }

  .candidate-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 9px 10px;
  }

  .candidate-row div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .candidate-row strong {
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .candidate-row span {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .candidate-row .score {
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: 900;
  }

  .drop-box {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 10px;
  }

  .drop-box span {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .drop-box p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.35;
  }
</style>
