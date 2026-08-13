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
    liveDraft = false,
    onContinue,
    onOpenEmergency,
  }: {
    draftName: string;
    scoring: string;
    season: string;
    hasRankings: boolean;
    rankingsStale?: boolean;
    hasProjections: boolean;
    hasAdp: boolean;
    aiConfigured: boolean;
    liveDraft?: boolean;
    onContinue: () => void;
    onOpenEmergency: () => void;
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
      label: "AI manager ready",
      pending: "Codex required",
      ready: aiConfigured,
    },
  ]);

  const fullyReady = $derived(
    hasRankings && !rankingsStale && hasProjections && hasAdp && aiConfigured,
  );

  const helperText = $derived.by(() => {
    if (fullyReady) return "All grounding sources and Codex are ready.";
    if (liveDraft) {
      return "Emergency access keeps the live board available, but disables AI advice until setup is complete.";
    }
    if (rankingsStale) return "Import a current ECR export before entering the AI draft room.";
    return "Complete all three data imports and connect Codex before entering the draft room.";
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
    <button class="btn btn-primary" type="button" disabled={!fullyReady} onclick={onContinue}>
      Enter draft room
    </button>
    {#if liveDraft && !fullyReady}
      <button class="emergency-action" type="button" onclick={onOpenEmergency}>
        Open emergency board only
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

  .emergency-action {
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .emergency-action:hover {
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
