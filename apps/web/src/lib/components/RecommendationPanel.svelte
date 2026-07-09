<script lang="ts">
  import Icon from "./Icon.svelte";
  import CandidateCard from "./CandidateCard.svelte";
  import type { DraftRecommendation, PlayerPreferenceLevel, PlayerPreferences } from "../types";

  let {
    recommendation,
    showPlaceholderWarning = false,
    playerPreferences = {},
    onSetPreference,
    onWhatIf,
    onClearPreferences,
    onOpenRankings,
  }: {
    recommendation: DraftRecommendation | null;
    showPlaceholderWarning?: boolean;
    playerPreferences?: PlayerPreferences;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onWhatIf?: (playerName: string) => void;
    onClearPreferences?: () => void;
    onOpenRankings?: () => void;
  } = $props();

  const confidenceTone = $derived(
    recommendation?.confidence === "high" ? "ready" : recommendation?.confidence === "medium" ? "info" : "warning",
  );
  const preferenceCounts = $derived.by(() => {
    const counts = { pin: 0, fade: 0, exclude: 0 };
    for (const preference of Object.values(playerPreferences)) {
      counts[preference] += 1;
    }
    return counts;
  });
  const preferenceCount = $derived(preferenceCounts.pin + preferenceCounts.fade + preferenceCounts.exclude);
  const preferenceSummary = $derived(
    [
      preferenceCounts.pin > 0 ? `${preferenceCounts.pin} pinned` : "",
      preferenceCounts.fade > 0 ? `${preferenceCounts.fade} faded` : "",
      preferenceCounts.exclude > 0 ? `${preferenceCounts.exclude} hidden` : "",
    ]
      .filter(Boolean)
      .join(" / "),
  );
</script>

<article class="panel recommendation-panel">
  <div class="panel-heading">
    <div>
      <h2><Icon name="target" size={18} /> {recommendation?.headline ?? "Waiting for board context"}</h2>
    </div>
    {#if recommendation}
      <span class="pill pill-{confidenceTone}">{recommendation.confidence} confidence</span>
    {/if}
  </div>

  {#if preferenceCount > 0}
    <div class="preference-summary">
      <div>
        <strong>{preferenceSummary}</strong>
        <span>Applied to the recommendation engine for this draft.</span>
      </div>
      {#if onClearPreferences}
        <button type="button" onclick={onClearPreferences}>Clear</button>
      {/if}
    </div>
  {/if}

  {#if showPlaceholderWarning}
    <div class="callout callout-warning placeholder-warning">
      <Icon name="alert" size={15} />
      <div>
        <strong>Using low-confidence placeholder values.</strong>
        <span>This draft hasn't had FantasyPros rankings imported yet, so scores are based on Sleeper's rough search-rank data, not real projections.</span>
        {#if onOpenRankings}
          <button class="btn btn-secondary" type="button" onclick={onOpenRankings}>Import rankings now</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if recommendation}
    <p class="summary">{recommendation.summary}</p>

    {#if recommendation.assumptions.length > 0}
      <details class="disclosure">
        <summary>Key assumptions ({recommendation.assumptions.length})</summary>
        <ul class="note-list">
          {#each recommendation.assumptions as assumption}
            <li>{assumption}</li>
          {/each}
        </ul>
      </details>
    {/if}

    {#if recommendation.risks.length > 0}
      <details class="disclosure">
        <summary>Risks to consider ({recommendation.risks.length})</summary>
        <ul class="note-list note-list-risk">
          {#each recommendation.risks as risk}
            <li>{risk}</li>
          {/each}
        </ul>
      </details>
    {/if}

    <div class="candidate-list">
      {#each recommendation.candidates as candidate, index (candidate.player.id)}
        <CandidateCard
          {candidate}
          rank={index + 1}
          featured={index === 0}
          preference={playerPreferences[candidate.player.id] ?? null}
          {onSetPreference}
          {onWhatIf}
        />
      {/each}
    </div>
  {:else}
    <p class="summary">The engine is preparing candidate signals.</p>
  {/if}
</article>

<style>
  .recommendation-panel {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .panel-heading h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: var(--text-xl);
  }

  .preference-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    padding: 10px 12px;
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .preference-summary > div {
    display: grid;
    gap: 2px;
  }

  .preference-summary strong {
    font-weight: 900;
  }

  .preference-summary span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .preference-summary button {
    border: 0;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 900;
    text-transform: uppercase;
  }

  .summary {
    color: var(--text-secondary);
    line-height: 1.55;
  }

  .placeholder-warning {
    align-items: flex-start;
  }

  .placeholder-warning > div {
    display: grid;
    gap: 6px;
  }

  .placeholder-warning strong {
    display: block;
  }

  .placeholder-warning .btn {
    justify-self: start;
    margin-top: 2px;
  }

  .disclosure {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 10px 13px;
  }

  .disclosure summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 700;
    list-style: none;
  }

  .disclosure summary::-webkit-details-marker {
    display: none;
  }

  .disclosure summary:hover {
    color: var(--text-primary);
  }

  .note-list {
    margin: 10px 0 0;
    padding-left: 18px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  .note-list-risk li::marker {
    color: var(--warning);
  }

  .candidate-list {
    display: grid;
    gap: 12px;
  }
</style>


