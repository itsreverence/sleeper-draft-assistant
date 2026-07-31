<script lang="ts">
  let {
    draftName,
    scoring,
    season,
    hasRankings,
    rankingsStale = false,
    hasProjections,
    hasAdp,
    aiConfigured,
    aiAcknowledged,
    liveDraft = false,
    onContinue,
    onContinueFallback,
  }: {
    draftName: string;
    scoring: string;
    season: string;
    hasRankings: boolean;
    rankingsStale?: boolean;
    hasProjections: boolean;
    hasAdp: boolean;
    aiConfigured: boolean;
    aiAcknowledged: boolean;
    liveDraft?: boolean;
    onContinue: () => void;
    onContinueFallback: () => void;
  } = $props();

  const loadedCount = $derived(
    Number(hasRankings) + Number(hasProjections) + Number(hasAdp),
  );

  const chips = $derived([
    {
      label: "ECR ready",
      pending: rankingsStale ? "ECR needs refresh" : "ECR rankings",
      ready: hasRankings && !rankingsStale,
    },
    { label: "Projections ready", pending: "Projections", ready: hasProjections },
    { label: "ADP ready", pending: "ADP", ready: hasAdp },
    {
      label: aiConfigured ? "AI manager ready" : "AI manager skipped",
      pending: "AI manager",
      ready: aiConfigured || aiAcknowledged,
    },
  ]);

  const helperText = $derived.by(() => {
    if (!aiAcknowledged) return "Choose an AI manager below, or continue without one.";
    if (hasRankings && !rankingsStale) {
      return loadedCount === 3
        ? "All grounding sources are ready."
        : "Minimum readiness met - add the recommended sources now or later.";
    }
    if (rankingsStale) return "Your previous rankings are available, but a current export is recommended.";
    if (liveDraft) return "Already on the clock - limited mode carries a data-quality warning.";
    return "Limited mode is available, but normal AI strategy starts after ECR is imported.";
  });
</script>

<section class="panel preparation-header" aria-labelledby="draft-preparation-title">
  <span class="section-label">Draft preparation</span>
  <h2 id="draft-preparation-title">Ground the AI before entering the draft room</h2>
  <p class="meta-line">{draftName} - {scoring} - {season} season - {loadedCount}/3 sources ready</p>

  <div class="chip-row" aria-label="Draft data readiness">
    {#each chips as chip}
      <span class="chip" class:ready={chip.ready}>
        <span class="dot"></span>
        {chip.ready ? chip.label : chip.pending}
      </span>
    {/each}
  </div>

  <div class="preparation-actions">
    <button class="btn btn-primary" type="button" disabled={!hasRankings || !aiAcknowledged} onclick={onContinue}>
      Enter draft room
    </button>
    {#if !hasRankings || !aiAcknowledged}
      <button class="limited-action" type="button" onclick={onContinueFallback}>
        {hasRankings ? "Continue without AI" : aiAcknowledged ? "Continue with limited data" : "Continue with limited data and no AI"}
      </button>
    {/if}
    <span class="helper-text">{helperText}</span>
  </div>
</section>

<style>
  .preparation-header {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-5);
  }

  .section-label {
    display: block;
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  h2 {
    max-width: 40ch;
    font-size: var(--text-lg);
    line-height: 1.25;
  }

  .meta-line {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 2px 0 4px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 5px 10px 5px 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .chip.ready {
    border-color: var(--border-strong);
    color: var(--text-secondary);
  }

  .chip .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--border-strong);
  }

  .chip.ready .dot {
    background: var(--accent);
  }

  .preparation-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
  }

  .helper-text {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .limited-action {
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .limited-action:hover {
    color: var(--text-primary);
  }

  @media (max-width: 640px) {
    .preparation-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .preparation-actions .btn {
      width: 100%;
    }
  }
</style>
