<script lang="ts">
  import Icon from "./Icon.svelte";
  import CandidateCard from "./CandidateCard.svelte";
  import ResponseMarkdown from "./ResponseMarkdown.svelte";
  import { currentAiDraftStrategy } from "../ai-panel";
  import type { AiDraftStrategyPayload, CandidateEvaluationPayload, DraftRecommendation, PlayerPreferenceLevel, PlayerPreferences } from "../types";

  let {
    recommendation,
    showPlaceholderWarning = false,
    playerPreferences = {},
    onSetPreference,
    onClearPreferences,
    onOpenRankings,
    currentPick,
    aiEnabled = false,
    aiStrategyEnabled = false,
    shouldRequestAiStrategy = false,
    strategyRequestKey = "",
    onEvaluateCandidate,
    onRequestAiStrategy,
  }: {
    recommendation: DraftRecommendation | null;
    showPlaceholderWarning?: boolean;
    playerPreferences?: PlayerPreferences;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onClearPreferences?: () => void;
    onOpenRankings?: () => void;
    currentPick: number;
    aiEnabled?: boolean;
    aiStrategyEnabled?: boolean;
    shouldRequestAiStrategy?: boolean;
    strategyRequestKey?: string;
    onEvaluateCandidate?: (playerId: string) => Promise<CandidateEvaluationPayload>;
    onRequestAiStrategy?: () => Promise<AiDraftStrategyPayload>;
  } = $props();

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
  let aiStrategy: AiDraftStrategyPayload | null = $state(null);
  let aiStrategyError = $state("");
  let isLoadingAiStrategy = $state(false);
  let lastAiStrategyKey = $state("");
  let aiStrategyRequestId = 0;
  const currentAiStrategy = $derived(currentAiDraftStrategy(aiStrategy, currentPick));
  const displayedCandidates = $derived.by(() => {
    const strategyCandidates = currentAiStrategy
      ? [currentAiStrategy.recommendedCandidate, ...currentAiStrategy.alternativeCandidates]
      : [];
    const deterministicCandidates = recommendation?.candidates ?? [];
    return Array.from(
      new Map([...strategyCandidates, ...deterministicCandidates].map((candidate) => [candidate.player.id, candidate])).values(),
    );
  });
  const primaryCandidates = $derived(displayedCandidates.slice(0, 3));
  const additionalCandidates = $derived(displayedCandidates.slice(3));
  const activeHeadline = $derived(currentAiStrategy?.decision.headline ?? recommendation?.headline ?? "Waiting for board context");
  const activeSummary = $derived(currentAiStrategy?.decision.summary ?? recommendation?.summary ?? "");
  const activeConfidence = $derived(currentAiStrategy?.decision.confidence ?? recommendation?.confidence ?? null);
  const confidenceTone = $derived(
    activeConfidence === "high" ? "ready" : activeConfidence === "medium" ? "info" : "warning",
  );
  let evaluations: Record<string, CandidateEvaluationPayload> = $state({});
  let evaluationErrors: Record<string, string> = $state({});
  let evaluatingPlayerId = $state("");
  let latestEvaluationPlayerId = $state("");
  const latestEvaluation = $derived(evaluations[latestEvaluationPlayerId] ?? null);
  const latestEvaluationStillListed = $derived(
    Boolean(latestEvaluation && recommendation?.candidates.some((candidate) => candidate.player.id === latestEvaluation.playerId)),
  );
  const detachedEvaluationError = $derived(
    latestEvaluationPlayerId && !recommendation?.candidates.some((candidate) => candidate.player.id === latestEvaluationPlayerId)
      ? evaluationErrors[latestEvaluationPlayerId] ?? ""
      : "",
  );

  async function evaluateCandidate(playerId: string) {
    if (!onEvaluateCandidate || evaluatingPlayerId) {
      return;
    }
    latestEvaluationPlayerId = playerId;
    evaluatingPlayerId = playerId;
    evaluationErrors = { ...evaluationErrors, [playerId]: "" };
    try {
      const evaluation = await onEvaluateCandidate(playerId);
      evaluations = { ...evaluations, [playerId]: evaluation };
    } catch (error) {
      evaluationErrors = {
        ...evaluationErrors,
        [playerId]: error instanceof Error ? error.message : "Could not evaluate this pick.",
      };
    } finally {
      evaluatingPlayerId = "";
    }
  }

  function retryAiStrategy() {
    aiStrategyError = "";
    lastAiStrategyKey = "";
  }

  $effect(() => {
    const requestKey = `${currentPick}:${strategyRequestKey}`;
    if (
      aiStrategyEnabled &&
      shouldRequestAiStrategy &&
      onRequestAiStrategy &&
      requestKey !== lastAiStrategyKey
    ) {
      lastAiStrategyKey = requestKey;
      const requestId = ++aiStrategyRequestId;
      isLoadingAiStrategy = true;
      aiStrategyError = "";
      void onRequestAiStrategy()
        .then((payload) => {
          if (requestId === aiStrategyRequestId && payload.pickNumber === currentPick) {
            aiStrategy = payload;
          }
        })
        .catch((error) => {
          if (requestId === aiStrategyRequestId) {
            aiStrategyError = error instanceof Error ? error.message : "The AI strategist could not evaluate this board.";
          }
        })
        .finally(() => {
          if (requestId === aiStrategyRequestId) {
            isLoadingAiStrategy = false;
          }
        });
    }
  });
</script>

<article class="panel recommendation-panel">
  <div class="panel-heading">
    <div>
      <h2><Icon name="target" size={18} /> {activeHeadline}</h2>
    </div>
    {#if activeConfidence}
      <span class="pill pill-{confidenceTone}">{activeConfidence} confidence</span>
    {/if}
  </div>

  {#if preferenceCount > 0}
    <div class="preference-summary">
      <div>
        <strong>{preferenceSummary}</strong>
        <span>Applied to AI strategy and the local fallback for this draft.</span>
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
        <strong>Import rankings before relying on this recommendation.</strong>
        <span>Sleeper search rank is only a temporary ordering signal.</span>
        {#if onOpenRankings}
          <button class="btn btn-secondary" type="button" onclick={onOpenRankings}>Import rankings now</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if recommendation}
    {#if currentAiStrategy}
      <div class="ai-strategy" aria-live="polite">
        <div class="ai-strategy-heading">
          <strong>AI draft strategy</strong>
          <span>{currentAiStrategy.decision.verdict}</span>
        </div>
        <p>{activeSummary}</p>
        <ul>
          {#each currentAiStrategy.decision.reasons as reason}
            <li>{reason}</li>
          {/each}
        </ul>
        {#if currentAiStrategy.decision.risks.length > 0}
          <details>
            <summary>Risks ({currentAiStrategy.decision.risks.length})</summary>
            <ul>
              {#each currentAiStrategy.decision.risks as risk}
                <li>{risk}</li>
              {/each}
            </ul>
          </details>
        {/if}
        <div class="draft-plan">
          <div class="draft-plan-heading">
            <strong>Living draft plan</strong>
            <span>Updated at pick {currentAiStrategy.decision.plan.updatedAtPick}</span>
          </div>
          <p class="plan-change">{currentAiStrategy.decision.plan.changeSummary}</p>
          <div class="plan-priorities">
            <div>
              <span>This pick</span>
              <strong>{currentAiStrategy.decision.plan.currentPickFocus.join(" / ") || "Best available"}</strong>
            </div>
            <div>
              <span>Next turn</span>
              <strong>{currentAiStrategy.decision.plan.nextTurnPriorities.join(" / ") || "Reassess board"}</strong>
            </div>
            <div>
              <span>Can wait</span>
              <strong>{currentAiStrategy.decision.plan.positionsThatCanWait.join(" / ") || "Nothing identified"}</strong>
            </div>
          </div>
          <details>
            <summary>View full plan</summary>
            <p>{currentAiStrategy.decision.plan.approach}</p>
            <div class="plan-detail">
              <strong>Roster goals</strong>
              <ul>
                {#each currentAiStrategy.decision.plan.rosterGoals as goal}
                  <li>{goal}</li>
                {/each}
              </ul>
            </div>
            {#if currentAiStrategy.decision.plan.watchItems.length > 0}
              <div class="plan-detail">
                <strong>Watching</strong>
                <ul>
                  {#each currentAiStrategy.decision.plan.watchItems as item}
                    <li>{item}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </details>
        </div>
      </div>
    {:else if isLoadingAiStrategy}
      <div class="ai-strategy-pending" aria-live="polite">
        <strong>AI strategist is reviewing this board.</strong>
        <span>Showing the immediate local fallback while Codex searches the available player pool and evaluates the draft.</span>
      </div>
      <p class="summary">{activeSummary}</p>
    {:else if aiStrategyEnabled && aiStrategyError}
      <div class="callout callout-warning" aria-live="polite">
        <div>
          <strong>AI strategy unavailable</strong>
          <span>{aiStrategyError} Showing the deterministic fallback.</span>
          <button class="btn btn-secondary" type="button" onclick={retryAiStrategy}>Retry AI strategy</button>
        </div>
      </div>
      <p class="summary">{activeSummary}</p>
    {:else}
      <p class="summary">{activeSummary}</p>
    {/if}

    {#if latestEvaluation && !latestEvaluationStillListed}
      <div class="detached-evaluation callout callout-warning" aria-live="polite">
        <div>
          <strong>AI take for {latestEvaluation.playerName} · stale after pick {latestEvaluation.pickNumber}</strong>
          <ResponseMarkdown content={latestEvaluation.answer} />
          <small>This player is no longer a current recommendation candidate. Re-evaluate an available player before acting.</small>
        </div>
      </div>
    {:else if detachedEvaluationError}
      <div class="callout callout-warning" aria-live="polite">{detachedEvaluationError}</div>
    {/if}

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
      {#each primaryCandidates as candidate, index (candidate.player.id)}
        <CandidateCard
          {candidate}
          rank={index + 1}
          featured={index === 0}
          {currentPick}
          aiEnabled={aiEnabled && !currentAiStrategy}
          evaluation={evaluations[candidate.player.id] ?? null}
          evaluationError={evaluationErrors[candidate.player.id] ?? ""}
          isEvaluating={evaluatingPlayerId === candidate.player.id}
          preference={playerPreferences[candidate.player.id] ?? null}
          {onSetPreference}
          onEvaluate={evaluateCandidate}
        />
      {/each}
    </div>
    {#if additionalCandidates.length > 0}
      <details class="more-candidates">
        <summary>Show {additionalCandidates.length} more candidate{additionalCandidates.length === 1 ? "" : "s"}</summary>
        <div class="candidate-list">
          {#each additionalCandidates as candidate, index (candidate.player.id)}
            <CandidateCard
              {candidate}
              rank={index + primaryCandidates.length + 1}
              {currentPick}
              aiEnabled={aiEnabled && !currentAiStrategy}
              evaluation={evaluations[candidate.player.id] ?? null}
              evaluationError={evaluationErrors[candidate.player.id] ?? ""}
              isEvaluating={evaluatingPlayerId === candidate.player.id}
              preference={playerPreferences[candidate.player.id] ?? null}
              {onSetPreference}
              onEvaluate={evaluateCandidate}
            />
          {/each}
        </div>
      </details>
    {/if}
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

  .ai-strategy,
  .ai-strategy-pending {
    display: grid;
    gap: 9px;
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    padding: 14px;
  }

  .ai-strategy-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .ai-strategy-heading strong {
    font-size: var(--text-sm);
  }

  .ai-strategy-heading span {
    color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 900;
    text-transform: uppercase;
  }

  .ai-strategy p,
  .ai-strategy-pending span {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .ai-strategy ul {
    margin: 0;
    padding-left: 18px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .ai-strategy details {
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .ai-strategy summary {
    cursor: pointer;
    font-weight: 800;
  }

  .draft-plan {
    display: grid;
    gap: 9px;
    border-top: 1px solid var(--accent-border);
    padding-top: 11px;
  }

  .draft-plan-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .draft-plan-heading > span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .ai-strategy .plan-change {
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .plan-priorities {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-block: 1px solid var(--accent-border);
  }

  .plan-priorities > div {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 9px 10px;
  }

  .plan-priorities > div + div {
    border-left: 1px solid var(--accent-border);
  }

  .plan-priorities span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .plan-priorities strong {
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
  }

  .plan-detail {
    margin-top: 9px;
  }

  .plan-detail > strong {
    color: var(--text-primary);
  }

  @media (max-width: 680px) {
    .plan-priorities {
      grid-template-columns: 1fr;
    }

    .plan-priorities > div + div {
      border-top: 1px solid var(--accent-border);
      border-left: 0;
    }
  }

  .callout > div {
    display: grid;
    gap: 7px;
  }

  .callout .btn {
    justify-self: start;
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

  .detached-evaluation {
    align-items: flex-start;
  }

  .detached-evaluation > div {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .detached-evaluation small {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
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

  .more-candidates {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }

  .more-candidates summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 800;
  }

  .more-candidates[open] summary {
    margin-bottom: 12px;
  }

  @media (max-width: 560px) {
    .panel-heading {
      flex-direction: column;
      gap: 8px;
    }

    .panel-heading h2 {
      font-size: var(--text-lg);
      line-height: 1.3;
    }
  }
</style>


