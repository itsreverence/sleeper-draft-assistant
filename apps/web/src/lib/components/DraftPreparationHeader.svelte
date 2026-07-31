<script lang="ts">
  import Icon from "./Icon.svelte";

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
</script>

<section class="panel preparation-header" aria-labelledby="draft-preparation-title">
  <div class="preparation-copy">
    <span class="section-label">Draft preparation</span>
    <h2 id="draft-preparation-title">Ground the AI before entering the draft room</h2>
    <p>
      Match FantasyPros exports to {draftName}. Rankings are the minimum required
      signal; projections and ADP make comparisons and pick timing more reliable.
    </p>
    <div class="draft-meta">
      <span>{scoring}</span>
      <span>{season} season</span>
      <span>{loadedCount}/3 sources ready</span>
    </div>
  </div>

  <div class="readiness-list" aria-label="Draft data readiness">
    <div class:ready={hasRankings && !rankingsStale}>
      <Icon name={hasRankings && !rankingsStale ? "check-circle" : "alert"} size={16} />
      <span>
        <strong>ECR rankings</strong>
        <small>{rankingsStale ? "Needs a current export" : hasRankings ? "Ready" : "Required for normal AI advice"}</small>
      </span>
    </div>
    <div class:ready={hasProjections}>
      <Icon name={hasProjections ? "check-circle" : "clock"} size={16} />
      <span>
        <strong>Season projections</strong>
        <small>{hasProjections ? "Ready" : "Recommended"}</small>
      </span>
    </div>
    <div class:ready={hasAdp}>
      <Icon name={hasAdp ? "check-circle" : "clock"} size={16} />
      <span>
        <strong>Sleeper ADP</strong>
        <small>{hasAdp ? "Ready" : "Recommended"}</small>
      </span>
    </div>
    <div class:ready={aiConfigured} class:acknowledged={!aiConfigured && aiAcknowledged}>
      <Icon name={aiConfigured ? "check-circle" : aiAcknowledged ? "check-circle" : "clock"} size={16} />
      <span>
        <strong>AI manager</strong>
        <small>{aiConfigured ? "Codex selected" : aiAcknowledged ? "Continuing without AI" : "Choose Codex or no AI"}</small>
      </span>
    </div>
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
    <p>
      {#if !aiAcknowledged}
        Choose an AI manager below. You can continue without AI and configure Codex later in Settings.
      {:else if hasRankings && !rankingsStale}
        {loadedCount === 3
          ? "All grounding sources are ready."
          : "Minimum readiness met. You can add the recommended sources now or later."}
      {:else if rankingsStale}
        Your previous rankings are available, but a current export is recommended before relying on draft advice.
      {:else if liveDraft}
        Already on the clock? Limited mode remains available, but its advice will carry a data-quality warning.
      {:else}
        The draft board remains available in limited mode, but normal AI strategy starts after ECR is imported.
      {/if}
    </p>
  </div>
</section>

<style>
  .preparation-header {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.8fr);
    gap: var(--space-5);
    padding: var(--space-6);
  }

  .preparation-copy {
    max-width: 68ch;
  }

  .section-label {
    display: block;
    margin-bottom: 8px;
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  h2 {
    max-width: 28ch;
    font-size: var(--text-2xl);
    line-height: 1.15;
  }

  .preparation-copy > p {
    margin-top: 10px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .draft-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: var(--space-4);
  }

  .draft-meta span {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    padding: 5px 8px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .readiness-list {
    display: grid;
    align-content: start;
    gap: 2px;
    border-block: 1px solid var(--border);
  }

  .readiness-list > div {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 10px;
    padding: 11px 2px;
  }

  .readiness-list > div + div {
    border-top: 1px solid var(--border);
  }

  .readiness-list :global(.icon) {
    color: var(--text-muted);
  }

  .readiness-list .ready :global(.icon) {
    color: var(--accent);
  }

  .readiness-list .acknowledged :global(.icon) {
    color: var(--text-secondary);
  }

  .readiness-list span {
    display: grid;
    gap: 2px;
  }

  .readiness-list strong {
    font-size: var(--text-sm);
  }

  .readiness-list small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .preparation-actions {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--border);
    padding-top: var(--space-4);
  }

  .preparation-actions p {
    margin-left: auto;
    max-width: 55ch;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
    text-align: right;
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

  @media (max-width: 760px) {
    .preparation-header {
      grid-template-columns: 1fr;
      padding: var(--space-5);
    }

    .preparation-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .preparation-actions .btn {
      width: 100%;
    }

    .preparation-actions p {
      margin-left: 0;
      text-align: left;
    }
  }
</style>
