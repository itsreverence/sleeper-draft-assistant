<script lang="ts">
  import type { CandidateEvaluationPayload, CandidateSignal, PlayerPreferenceLevel } from "../types";
  import { rosterFitLabel, sourceLabel } from "../format";
  import Icon from "./Icon.svelte";
  import ResponseMarkdown from "./ResponseMarkdown.svelte";

  let {
    candidate,
    rank,
    preference = null,
    featured = false,
    currentPick,
    aiEnabled = false,
    evaluation = null,
    evaluationError = "",
    isEvaluating = false,
    onSetPreference,
    onEvaluate,
  }: {
    candidate: CandidateSignal;
    rank: number;
    preference?: PlayerPreferenceLevel | null;
    featured?: boolean;
    currentPick: number;
    aiEnabled?: boolean;
    evaluation?: CandidateEvaluationPayload | null;
    evaluationError?: string;
    isEvaluating?: boolean;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onEvaluate?: (playerId: string) => void | Promise<void>;
  } = $props();

  let detailsOpen = $state(false);

  const returnPct = $derived(Math.round(candidate.returnProbability * 100));
  const primaryReason = $derived(candidate.reasons[0] ?? rosterFitLabel(candidate.rosterFit));
  const extraReasons = $derived(candidate.reasons.slice(1));
  const evaluationStale = $derived(Boolean(evaluation && evaluation.pickNumber !== currentPick));

  function togglePreference(nextPreference: PlayerPreferenceLevel) {
    onSetPreference?.(candidate.player.id, preference === nextPreference ? null : nextPreference);
  }

  function evaluateCandidate() {
    if (!onEvaluate || isEvaluating) {
      return;
    }
    detailsOpen = true;
    void onEvaluate(candidate.player.id);
  }
</script>

<section
  class="candidate-card"
  class:excluded={preference === "exclude"}
  class:pinned={preference === "pin"}
  class:featured
>
  <div class="candidate-main">
    <div class="rank">{rank}</div>
    <div class="candidate-copy">
      <div class="name-row">
        <h3>{candidate.player.name}</h3>
        {#if preference}
          <span class="preference-badge preference-{preference}">{preference === "pin" ? "shortlisted" : preference}</span>
        {/if}
      </div>
      <p>{candidate.player.team} - {candidate.player.position} - {rosterFitLabel(candidate.rosterFit)}</p>
      <p class="reason">{primaryReason}</p>
      {#if candidate.player.importedRank}
        <p class="import-meta">
          Rank {candidate.player.importedRank}{candidate.player.tier ? ` - Tier ${candidate.player.tier}` : ""}{candidate.player.byeWeek ? ` - Bye ${candidate.player.byeWeek}` : ""}
        </p>
      {:else}
        <p class="import-meta">{sourceLabel(candidate)}</p>
      {/if}
    </div>
    <strong class="score">{candidate.score.toFixed(1)}</strong>
  </div>

  <div class="actions">
    <button
      class:active={preference === "pin"}
      type="button"
      aria-pressed={preference === "pin"}
      onclick={() => togglePreference("pin")}
    >
      {preference === "pin" ? "Shortlisted" : "Shortlist"}
    </button>
    {#if aiEnabled && featured}
      <button
        class="ai-action"
        type="button"
        title={`Ask AI whether to draft ${candidate.player.name}`}
        disabled={isEvaluating}
        onclick={evaluateCandidate}
      >
        <Icon name="message" size={13} />
        {isEvaluating ? "Thinking" : evaluation ? "Refresh AI take" : "AI take"}
      </button>
    {/if}
    <button class="details-toggle" type="button" aria-expanded={detailsOpen} onclick={() => (detailsOpen = !detailsOpen)}>
      {detailsOpen ? "Less" : "Details"}
    </button>
  </div>

  {#if detailsOpen}
    <div class="details">
      <div class="signal-row">
        <span>{candidate.valueLabel}</span>
        <span>{candidate.scarcityLabel}</span>
        <span>{returnPct}% return</span>
      </div>
      {#if extraReasons.length > 0}
        <ul>
          {#each extraReasons as reason}
            <li>{reason}</li>
          {/each}
        </ul>
      {/if}
      <div class="secondary-actions" aria-label={`Preferences for ${candidate.player.name}`}>
        <button
          class:active={preference === "fade"}
          type="button"
          aria-pressed={preference === "fade"}
          onclick={() => togglePreference("fade")}
        >
          {preference === "fade" ? "Faded" : "Fade"}
        </button>
        <button
          class:active={preference === "exclude"}
          type="button"
          aria-pressed={preference === "exclude"}
          onclick={() => togglePreference("exclude")}
        >
          {preference === "exclude" ? "Excluded" : "Exclude"}
        </button>
        {#if aiEnabled && !featured}
          <button
            class="ai-secondary"
            type="button"
            title={`Ask AI whether to draft ${candidate.player.name}`}
            disabled={isEvaluating}
            onclick={evaluateCandidate}
          >
            <Icon name="message" size={13} />
            {isEvaluating ? "Thinking" : evaluation ? "Refresh AI take" : "AI take"}
          </button>
        {/if}
      </div>
    </div>
  {/if}

  {#if evaluation || evaluationError || isEvaluating}
    <div class="evaluation" class:stale={evaluationStale} aria-live="polite">
      <div class="evaluation-heading">
        <strong>AI take</strong>
        {#if evaluationStale}<span>Board changed · refresh</span>{/if}
      </div>
      {#if isEvaluating}
        <p>Evaluating {candidate.player.name} against the current board...</p>
      {:else if evaluationError}
        <p class="evaluation-error">{evaluationError}</p>
      {:else if evaluation}
        <ResponseMarkdown content={evaluation.answer} />
        <small>Evaluated at pick {evaluation.pickNumber}. Verify model analysis against the deterministic evidence above.</small>
      {/if}
    </div>
  {/if}
</section>

<style>
  .candidate-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: var(--space-4);
    transition: border-color var(--transition-base), opacity var(--transition-fast);
  }

  .candidate-card:hover {
    border-color: var(--border-strong);
  }

  .candidate-card.featured {
    border-color: var(--accent-border);
    background: color-mix(in srgb, var(--accent-soft) 35%, var(--surface-sunken));
  }

  .candidate-card.pinned {
    border-color: var(--accent-border);
  }

  .candidate-card.excluded {
    opacity: 0.62;
  }

  .candidate-main {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .rank {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 26px;
    height: 26px;
    margin-top: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .featured .rank {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .candidate-copy {
    flex: 1;
    min-width: 0;
  }

  .name-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .candidate-copy h3 {
    font-size: var(--text-md);
    font-weight: 700;
  }

  .candidate-copy p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .reason {
    margin-top: 6px !important;
    color: var(--text-secondary) !important;
    line-height: 1.45;
  }

  .import-meta {
    margin-top: 4px !important;
    font-size: var(--text-xs) !important;
    font-weight: 600;
  }

  .preference-badge {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 3px 7px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1;
    text-transform: uppercase;
  }

  .preference-pin {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .preference-fade {
    border-color: var(--warning-border);
    background: var(--warning-soft);
    color: var(--warning);
  }

  .preference-exclude {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }

  .score {
    flex-shrink: 0;
    color: var(--accent);
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    padding: 7px 10px;
  }

  .actions button:disabled,
  .secondary-actions button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .actions button:hover,
  .actions button.active {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
  }

  .details-toggle {
    margin-left: auto;
  }

  .details {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .signal-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .signal-row span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .details ul {
    margin: 0;
    padding-left: 18px;
  }

  .details li {
    margin-bottom: 4px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .details li:last-child {
    margin-bottom: 0;
  }

  .secondary-actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }

  .secondary-actions button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    background: transparent;
    padding: 4px 0;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .ai-secondary {
    margin-left: auto;
  }

  .evaluation {
    display: grid;
    gap: 8px;
    margin-top: 12px;
    padding: 12px;
    border: 1px solid var(--info-border);
    border-radius: var(--radius-md);
    background: var(--info-soft);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .evaluation.stale {
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .evaluation-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .evaluation-heading strong {
    color: var(--text-primary);
  }

  .evaluation-heading span,
  .evaluation small {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .evaluation p {
    margin: 0;
  }

  .evaluation-error {
    color: var(--danger);
  }

  .secondary-actions button + button {
    margin-left: 12px;
  }

  .secondary-actions button:hover,
  .secondary-actions button.active {
    color: var(--text-primary);
  }
</style>
