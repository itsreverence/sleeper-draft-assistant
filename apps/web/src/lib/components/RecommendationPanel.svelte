<script lang="ts">
  import Icon from "./Icon.svelte";
  import PlayerPreferenceMenu from "./PlayerPreferenceMenu.svelte";
  import { currentAiDraftStrategy, recommendationTurnPresentation } from "../ai-panel";
  import { formatDraftPick, rosterFitLabel, sourceLabel } from "../format";
  import type { AiDraftStrategyPayload, DraftOption, DraftState, PlayerPreferenceLevel, PlayerPreferences } from "../types";

  let {
    showPlaceholderWarning = false,
    playerPreferences = {},
    onSetPreference,
    onClearPreferences,
    onOpenRankings,
    onOpenSettings,
    onOpenPlayerSearch,
    currentPick,
    aiEnabled = false,
    aiStrategyEnabled = false,
    shouldRequestAiStrategy = false,
    strategyRequestKey = "",
    onAskAboutCandidate,
    onRequestAiStrategy,
    strategyOpen = false,
    onToggleStrategy,
    draftState,
  }: {
    showPlaceholderWarning?: boolean;
    playerPreferences?: PlayerPreferences;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onClearPreferences?: () => void;
    onOpenRankings?: () => void;
    onOpenSettings?: () => void;
    onOpenPlayerSearch?: () => void;
    currentPick: number;
    aiEnabled?: boolean;
    aiStrategyEnabled?: boolean;
    shouldRequestAiStrategy?: boolean;
    strategyRequestKey?: string;
    onAskAboutCandidate?: (playerName: string, recommendedPlayerName: string) => void;
    onRequestAiStrategy?: () => Promise<AiDraftStrategyPayload>;
    strategyOpen?: boolean;
    onToggleStrategy?: () => void;
    draftState: DraftState;
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
      preferenceCounts.pin > 0 ? `${preferenceCounts.pin} prioritized` : "",
      preferenceCounts.fade > 0 ? `${preferenceCounts.fade} deprioritized` : "",
      preferenceCounts.exclude > 0 ? `${preferenceCounts.exclude} excluded` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  let aiStrategy: AiDraftStrategyPayload | null = $state(null);
  let aiStrategyError = $state("");
  let isLoadingAiStrategy = $state(false);
  let analysisOpen = $state(false);
  let lastAiStrategyKey = $state("");
  let aiStrategyRequestId = 0;
  const currentAiStrategy = $derived(
    aiEnabled ? currentAiDraftStrategy(aiStrategy, currentPick) : null,
  );
  const displayedAiStrategy = $derived(aiEnabled ? (currentAiStrategy ?? aiStrategy) : null);
  const isPreviousRecommendation = $derived(
    displayedAiStrategy !== null && displayedAiStrategy.pickNumber !== currentPick,
  );
  const strategyInteractionDisabled = $derived(
    isLoadingAiStrategy || isPreviousRecommendation || aiStrategyError.length > 0,
  );
  const alternativeAiCandidates = $derived.by(() => {
    const strategy = displayedAiStrategy;
    if (!strategy) {
      return [];
    }
    return Array.from(
      new Map(
        strategy.alternativeCandidates
          .filter((candidate) => candidate.player.id !== strategy.recommendedCandidate.player.id)
          .map((candidate) => [candidate.player.id, candidate]),
      ).values(),
    );
  });
  const turnPresentation = $derived.by(() => {
    const strategy = displayedAiStrategy;
    return strategy && !isPreviousRecommendation
      ? recommendationTurnPresentation(
        draftState,
        strategy.recommendedCandidate.player.name,
        strategy.decision.headline,
      )
      : null;
  });
  const activeHeadline = $derived(
    isPreviousRecommendation
      ? `Previous: ${displayedAiStrategy?.decision.headline ?? "recommendation"}`
      : turnPresentation?.headline ?? "AI draft assistant",
  );
  const timingSummary = $derived(turnPresentation?.timing ?? null);
  const activeConfidence = $derived(
    isPreviousRecommendation ? null : displayedAiStrategy?.decision.confidence ?? null,
  );
  const turnContext = $derived.by(() => {
    const confidence = activeConfidence
      ? `${activeConfidence.charAt(0).toUpperCase()}${activeConfidence.slice(1)} confidence`
      : null;
    if (!timingSummary) return confidence;
    if (!confidence) return timingSummary;
    const [lead, ...rest] = timingSummary.split(" · ");
    return [lead, confidence, ...rest].join(" · ");
  });
  function contingencyLabel(candidate: DraftOption): string {
    const nextUserPick = turnPresentation?.nextUserPick;
    if (nextUserPick === null || nextUserPick === undefined || !turnPresentation?.contingent) return "AI alternative";
    const turnRangeStart = Math.max(currentPick, nextUserPick - 2);
    const marketPoint = candidate.player.importedRank
      ?? candidate.player.realTimeAdp
      ?? candidate.player.adp;
    return marketPoint !== null && marketPoint !== undefined && marketPoint >= turnRangeStart
      ? `${formatDraftPick(nextUserPick, draftState.settings.teams)} range`
      : "Elite faller";
  }
  function retryAiStrategy() {
    aiStrategyError = "";
    lastAiStrategyKey = "";
  }

  function discussCandidate(playerName: string) {
    const recommendedPlayerName = displayedAiStrategy?.recommendedCandidate.player.name;
    if (recommendedPlayerName) {
      onAskAboutCandidate?.(playerName, recommendedPlayerName);
    }
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
    <div class="decision-heading">
      <span>AI call</span>
      <h2>{activeHeadline}</h2>
    </div>
  </div>

  {#if showPlaceholderWarning}
    <div class="callout callout-warning placeholder-warning">
      <Icon name="alert" size={15} />
      <div>
        <strong>Player value data is incomplete.</strong>
        <span>AI can reason from the draft state, but Sleeper search ranks are only placeholder valuation evidence.</span>
        {#if onOpenRankings}
          <button class="btn btn-secondary" type="button" onclick={onOpenRankings}>Import rankings</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if displayedAiStrategy}
    <div class:previous={isPreviousRecommendation} class="ai-strategy" aria-live="polite" aria-busy={isLoadingAiStrategy}>
      <div class="decision-layout">
        <div class="decision-main">
          {#if isPreviousRecommendation}
            <span class="previous-recommendation-label">Previous recommendation</span>
          {/if}
          {#if isLoadingAiStrategy}
            <div class="strategy-refresh-status">
              <span class="spinner"></span>
              <strong>{isPreviousRecommendation ? "Reviewing latest board…" : "Updating recommendation…"}</strong>
            </div>
          {/if}
          {#if aiStrategyError}
            <div class="strategy-refresh-error">
              <div>
                <strong>Recommendation update failed</strong>
                <span>{aiStrategyError}</span>
              </div>
              <button type="button" onclick={retryAiStrategy}>Retry recommendation</button>
            </div>
          {/if}
          {#if turnContext}<p class="turn-context">{turnContext}</p>{/if}
          <p class="decision-summary">{displayedAiStrategy.decision.summary}</p>
          <div class="decision-actions">
            <PlayerPreferenceMenu
              playerId={displayedAiStrategy.recommendedCandidate.player.id}
              playerName={displayedAiStrategy.recommendedCandidate.player.name}
              preference={playerPreferences[displayedAiStrategy.recommendedCandidate.player.id] ?? null}
              onSetPreference={strategyInteractionDisabled ? undefined : onSetPreference}
            />
            <button
              type="button"
              disabled={strategyInteractionDisabled}
              title={`Ask about drafting ${displayedAiStrategy.recommendedCandidate.player.name}`}
              onclick={() => discussCandidate(displayedAiStrategy.recommendedCandidate.player.name)}
            >
              <Icon name="message" size={13} />
              Ask Codex
            </button>
            <button
              class="analysis-trigger"
              class:active={analysisOpen}
              type="button"
              disabled={strategyInteractionDisabled}
              aria-expanded={analysisOpen}
              onclick={() => (analysisOpen = !analysisOpen)}
            >
              Why
            </button>
          </div>
          {#if preferenceCount > 0}
            <div class="preference-summary" aria-label="Draft preferences">
              <span>{preferenceSummary}</span>
              {#if onClearPreferences}
                <button type="button" onclick={onClearPreferences}>Clear</button>
              {/if}
            </div>
          {/if}
        </div>
        {#if alternativeAiCandidates.length > 0}
          <aside class="fallback-ladder" aria-label="Fallback order">
            <h3>If unavailable</h3>
            <ol>
              {#each alternativeAiCandidates as candidate, index (candidate.player.id)}
                <li>
                  <span class="fallback-rank">{index + 1}</span>
                  <span class="fallback-player">
                    <strong>{candidate.player.name}</strong>
                    <small>{candidate.player.team} · {candidate.player.position} · {contingencyLabel(candidate)}</small>
                  </span>
                </li>
              {/each}
            </ol>
          </aside>
        {/if}
      </div>
      {#if analysisOpen}
        <div class="analysis-content">
          <section>
            <h3>Why this call</h3>
            <ul>
              {#each displayedAiStrategy.decision.reasons as reason}
                <li>{reason}</li>
              {/each}
            </ul>
          </section>
          <section>
            <h3>Evidence</h3>
            <div class="evidence-summary">
              <span>
                {displayedAiStrategy.recommendedCandidate.player.team} -
                {displayedAiStrategy.recommendedCandidate.player.position}
              </span>
              <span>{rosterFitLabel(displayedAiStrategy.recommendedCandidate.rosterFit)}</span>
              <span>{sourceLabel(displayedAiStrategy.recommendedCandidate)}</span>
            </div>
            {#if displayedAiStrategy.recommendedCandidate.evidence.length > 0}
              <ul>
                {#each displayedAiStrategy.recommendedCandidate.evidence as evidence}
                  <li>{evidence}</li>
                {/each}
              </ul>
            {/if}
          </section>
          {#if displayedAiStrategy.decision.risks.length > 0}
            <section>
              <h3>Risks and constraints</h3>
              <ul>
                {#each displayedAiStrategy.decision.risks as risk}
                  <li>{risk}</li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
      {/if}
      <div class="strategy-glance" aria-label="Draft strategy summary">
        <span>Next: <strong>{displayedAiStrategy.decision.plan.nextTurnPriorities.join(" / ") || "Reassess board"}</strong></span>
        <span>Wait: <strong>{displayedAiStrategy.decision.plan.positionsThatCanWait.join(" / ") || "Nothing identified"}</strong></span>
        <div class="strategy-utilities">
          {#if onOpenPlayerSearch}
            <button type="button" onclick={onOpenPlayerSearch}>
              <Icon name="search" size={12} />
              Find player
            </button>
          {/if}
          {#if onToggleStrategy}
            <button
              type="button"
              aria-expanded={strategyOpen}
              onclick={onToggleStrategy}
            >
              {strategyOpen ? "Close plan" : "Draft plan"}
              <Icon name="chevron-right" size={12} />
            </button>
          {/if}
        </div>
      </div>
    </div>
  {:else if !aiEnabled}
    <div class="empty-state" aria-live="polite">
      <Icon name="message" size={20} />
      <div>
        <strong>Connect an AI provider for draft strategy</strong>
        <span>The draft board and imported data remain available, but this app does not generate local pick recommendations.</span>
      </div>
      {#if onOpenSettings}
        <button class="btn btn-primary" type="button" onclick={onOpenSettings}>Open AI settings</button>
      {/if}
    </div>
  {:else if isLoadingAiStrategy}
    <div class="ai-strategy-pending" aria-live="polite">
      <span class="spinner"></span>
      <div>
        <strong>AI strategist is reviewing this board</strong>
        <span>Codex can search the complete available-player pool while it evaluates the current roster and draft room.</span>
      </div>
    </div>
  {:else if aiStrategyEnabled && aiStrategyError}
    <div class="callout callout-warning" aria-live="polite">
      <div>
        <strong>AI strategy unavailable</strong>
        <span>{aiStrategyError}</span>
        <button class="btn btn-secondary" type="button" onclick={retryAiStrategy}>Retry AI strategy</button>
      </div>
    </div>
  {:else if !aiStrategyEnabled}
    <div class="empty-state" aria-live="polite">
      <Icon name="pause" size={20} />
      <div>
        <strong>Automatic AI strategy is paused</strong>
        <span>Enable automatic draft strategy in Settings or use Ask about this draft for an on-demand decision.</span>
      </div>
      {#if onOpenSettings}
        <button class="btn btn-secondary" type="button" onclick={onOpenSettings}>Open AI settings</button>
      {/if}
    </div>
  {:else}
    <div class="empty-state" aria-live="polite">
      <Icon name="clock" size={20} />
      <div>
        <strong>AI strategy will update near your turn</strong>
        <span>Automatic analysis starts when you are within two picks. Ask about this draft remains available at any time.</span>
      </div>
    </div>
  {/if}

</article>

<style>
  .recommendation-panel {
    display: grid;
    align-content: start;
    gap: 14px;
    padding: var(--space-5);
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .panel-heading h2 {
    margin-top: 3px;
    font-size: var(--text-xl);
  }

  .decision-heading {
    display: grid;
    gap: 4px;
  }

  .decision-heading > span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .preference-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .preference-summary span,
  .empty-state span,
  .ai-strategy-pending span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .preference-summary button {
    border: 0;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .empty-state > div,
  .ai-strategy-pending > div {
    display: grid;
    gap: 3px;
  }

  .ai-strategy {
    display: grid;
    gap: 10px;
  }

  .decision-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .decision-main {
    display: grid;
    align-content: start;
    gap: 10px;
    min-width: 0;
  }

  .strategy-refresh-status,
  .previous-recommendation-label {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 7px;
    color: var(--info);
    font-size: var(--text-xs);
  }

  .strategy-refresh-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warning) 8%, transparent);
    padding: 9px 10px;
  }

  .strategy-refresh-error > div {
    display: grid;
    gap: 2px;
  }

  .strategy-refresh-error strong,
  .strategy-refresh-error span {
    font-size: var(--text-xs);
  }

  .strategy-refresh-error span {
    color: var(--text-secondary);
  }

  .strategy-refresh-error button {
    flex: 0 0 auto;
    border: 0;
    background: transparent;
    padding: 3px;
    color: var(--accent);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .previous-recommendation-label {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    padding: 4px 8px;
    color: var(--text-secondary);
    font-weight: 800;
    text-transform: uppercase;
  }

  .ai-strategy.previous .decision-main > :not(.strategy-refresh-status, .strategy-refresh-error, .previous-recommendation-label),
  .ai-strategy.previous .fallback-ladder,
  .ai-strategy.previous .strategy-glance {
    opacity: 0.58;
  }

  .fallback-ladder {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }

  .fallback-ladder h3 {
    margin: 0 0 10px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
    text-transform: uppercase;
  }

  .fallback-ladder ol {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fallback-ladder li {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border-left: 1px solid var(--border);
    padding: 2px 14px;
  }

  .fallback-ladder li:first-child {
    border-left: 0;
    padding-left: 0;
  }

  .fallback-rank {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .fallback-player {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .fallback-player strong {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fallback-player small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-strategy-pending {
    display: grid;
    gap: 9px;
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    padding: 14px;
  }

  .ai-strategy-pending {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  .ai-strategy p {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .ai-strategy .turn-context {
    width: fit-content;
    padding: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 750;
  }

  .ai-strategy .turn-context::before {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 7px;
    border-radius: 50%;
    background: var(--accent);
    content: "";
    vertical-align: 1px;
  }

  .ai-strategy .decision-summary {
    max-width: 72ch;
    color: var(--text-primary);
    font-size: var(--text-md);
    font-weight: 650;
    line-height: 1.55;
  }

  .decision-actions,
  .evidence-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
  }

  .decision-actions > button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    padding: 3px 0;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .decision-actions > button:hover {
    background: transparent;
    color: var(--text-primary);
  }

  .decision-actions > button.active {
    background: transparent;
    color: var(--accent);
  }

  .decision-actions :global(.preference-trigger) {
    border: 0;
    background: transparent;
    padding: 3px 0;
    color: var(--text-secondary);
  }

  .decision-actions :global(.preference-trigger:hover),
  .decision-actions :global(.preference-trigger.active),
  .decision-actions :global(.preference-trigger[aria-expanded="true"]) {
    background: transparent;
    color: var(--accent);
  }

  .evidence-summary span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .ai-strategy ul {
    margin: 0;
    padding-left: 18px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .strategy-glance {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    border-top: 1px solid var(--border);
    padding-top: 11px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .strategy-glance strong {
    color: var(--text-secondary);
    font-weight: 800;
  }

  .strategy-utilities {
    display: flex;
    align-items: center;
    margin-left: auto;
    gap: 16px;
  }

  .strategy-utilities button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    padding: 3px 0;
    color: var(--accent);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .strategy-utilities button:hover {
    background: transparent;
    color: var(--text-primary);
  }

  .analysis-content {
    display: grid;
    gap: 16px;
    border-top: 1px solid var(--border);
    padding-top: 14px;
  }

  .analysis-content section {
    display: grid;
    gap: 8px;
  }

  .analysis-content section + section {
    border-top: 1px solid var(--border);
    padding-top: 14px;
  }

  .analysis-content h3 {
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .callout > div,
  .placeholder-warning > div {
    display: grid;
    gap: 7px;
  }

  .callout .btn,
  .placeholder-warning .btn {
    justify-self: start;
  }

  .placeholder-warning {
    align-items: flex-start;
  }

  .empty-state {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 14px;
  }

  .empty-state > :global(.icon) {
    color: var(--info);
  }

  @media (max-width: 860px) {
    .fallback-ladder ol {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .fallback-ladder li:nth-child(odd) {
      border-left: 0;
      padding-left: 0;
    }

    .fallback-ladder li:nth-child(n + 3) {
      border-top: 1px solid var(--border);
      margin-top: 9px;
      padding-top: 9px;
    }
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

    .empty-state {
      grid-template-columns: auto 1fr;
    }

    .empty-state .btn {
      grid-column: 1 / -1;
      width: 100%;
    }

    .strategy-glance {
      align-items: flex-start;
    }

    .strategy-utilities {
      width: 100%;
      margin-left: 0;
      justify-content: flex-start;
    }

    .fallback-ladder ol {
      grid-template-columns: 1fr;
    }

    .fallback-ladder li,
    .fallback-ladder li:first-child,
    .fallback-ladder li:nth-child(odd),
    .fallback-ladder li:nth-child(n + 3) {
      border-top: 1px solid var(--border);
      border-left: 0;
      margin-top: 0;
      padding: 9px 0;
    }
  }
</style>
