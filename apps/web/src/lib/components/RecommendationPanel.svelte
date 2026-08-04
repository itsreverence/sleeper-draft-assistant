<script lang="ts">
  import Icon from "./Icon.svelte";
  import CandidateCard from "./CandidateCard.svelte";
  import PlayerPreferenceMenu from "./PlayerPreferenceMenu.svelte";
  import { currentAiDraftStrategy } from "../ai-panel";
  import { rosterFitLabel, sourceLabel } from "../format";
  import type { AiDraftStrategyPayload, PlayerPreferenceLevel, PlayerPreferences } from "../types";

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
  let alternativesOpen = $state(false);
  let lastAiStrategyKey = $state("");
  let aiStrategyRequestId = 0;
  const currentAiStrategy = $derived(
    aiEnabled ? currentAiDraftStrategy(aiStrategy, currentPick) : null,
  );
  const alternativeAiCandidates = $derived.by(() => {
    const strategy = currentAiStrategy;
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
  const activeHeadline = $derived(currentAiStrategy?.decision.headline ?? "AI draft assistant");
  const activeConfidence = $derived(currentAiStrategy?.decision.confidence ?? null);
  const confidenceTone = $derived(
    activeConfidence === "high" ? "ready" : activeConfidence === "medium" ? "info" : "warning",
  );
  function retryAiStrategy() {
    aiStrategyError = "";
    lastAiStrategyKey = "";
  }

  function discussCandidate(playerName: string) {
    const recommendedPlayerName = currentAiStrategy?.recommendedCandidate.player.name;
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
      aiStrategy = null;
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
      <h2><Icon name="target" size={18} /> {activeHeadline}</h2>
    </div>
    <div class="decision-status">
      {#if onOpenPlayerSearch}
        <button
          class="player-search-trigger"
          type="button"
          title="Find a player"
          aria-label="Find a player"
          onclick={onOpenPlayerSearch}
        >
          <Icon name="search" size={15} />
        </button>
      {/if}
      {#if onToggleStrategy}
        <button
          class="player-search-trigger"
          type="button"
          title="Guide draft strategy"
          aria-label="Guide draft strategy"
          onclick={onToggleStrategy}
        >
          <Icon name="clipboard" size={15} />
        </button>
      {/if}
      {#if activeConfidence}
        <span class="pill pill-{confidenceTone}">{activeConfidence} confidence</span>
      {/if}
      {#if currentAiStrategy && currentAiStrategy.decision.risks.length > 0}
        <span class="pill pill-warning">
          {currentAiStrategy.decision.risks.length} consideration{currentAiStrategy.decision.risks.length === 1 ? "" : "s"}
        </span>
      {/if}
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

  {#if currentAiStrategy}
    <div class="ai-strategy" aria-live="polite">
      <p class="decision-summary">{currentAiStrategy.decision.summary}</p>
      <div class="decision-actions">
        <PlayerPreferenceMenu
          playerId={currentAiStrategy.recommendedCandidate.player.id}
          playerName={currentAiStrategy.recommendedCandidate.player.name}
          preference={playerPreferences[currentAiStrategy.recommendedCandidate.player.id] ?? null}
          {onSetPreference}
        />
        <button
          type="button"
          title={`Ask about drafting ${currentAiStrategy.recommendedCandidate.player.name}`}
          onclick={() => discussCandidate(currentAiStrategy.recommendedCandidate.player.name)}
        >
          <Icon name="message" size={13} />
          Ask about pick
        </button>
        {#if alternativeAiCandidates.length > 0}
          <button
            class:active={alternativesOpen}
            type="button"
            aria-expanded={alternativesOpen}
            onclick={() => (alternativesOpen = !alternativesOpen)}
          >
            {alternativeAiCandidates.length} alternatives
          </button>
        {/if}
        <button
          class="analysis-trigger"
          class:active={analysisOpen}
          type="button"
          aria-expanded={analysisOpen}
          onclick={() => (analysisOpen = !analysisOpen)}
        >
          Analysis
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
      {#if analysisOpen}
        <div class="analysis-content">
          <section>
            <h3>Why this call</h3>
            <ul>
              {#each currentAiStrategy.decision.reasons as reason}
                <li>{reason}</li>
              {/each}
            </ul>
          </section>
          <section>
            <h3>Evidence</h3>
            <div class="evidence-summary">
              <span>
                {currentAiStrategy.recommendedCandidate.player.team} -
                {currentAiStrategy.recommendedCandidate.player.position}
              </span>
              <span>{rosterFitLabel(currentAiStrategy.recommendedCandidate.rosterFit)}</span>
              <span>{sourceLabel(currentAiStrategy.recommendedCandidate)}</span>
            </div>
            {#if currentAiStrategy.recommendedCandidate.evidence.length > 0}
              <ul>
                {#each currentAiStrategy.recommendedCandidate.evidence as evidence}
                  <li>{evidence}</li>
                {/each}
              </ul>
            {/if}
          </section>
          {#if currentAiStrategy.decision.risks.length > 0}
            <section>
              <h3>Risks and constraints</h3>
              <ul>
                {#each currentAiStrategy.decision.risks as risk}
                  <li>{risk}</li>
                {/each}
              </ul>
            </section>
          {/if}
        </div>
      {/if}
      {#if alternativesOpen && alternativeAiCandidates.length > 0}
        <div class="alternatives-content">
          <div class="candidate-list">
            {#each alternativeAiCandidates as candidate, index (candidate.player.id)}
              <CandidateCard
                {candidate}
                rank={index + 2}
                preference={playerPreferences[candidate.player.id] ?? null}
                {onSetPreference}
                onDiscuss={discussCandidate}
              />
            {/each}
          </div>
        </div>
      {/if}
      <div class="strategy-glance" aria-label="Draft strategy summary">
        <span>Next: <strong>{currentAiStrategy.decision.plan.nextTurnPriorities.join(" / ") || "Reassess board"}</strong></span>
        <span>Wait: <strong>{currentAiStrategy.decision.plan.positionsThatCanWait.join(" / ") || "Nothing identified"}</strong></span>
        {#if onToggleStrategy}
          <button
            type="button"
            aria-expanded={strategyOpen}
            onclick={onToggleStrategy}
          >
            {strategyOpen ? "Close draft plan" : "Open draft plan"}
            <Icon name="chevron-right" size={12} />
          </button>
        {/if}
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
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: var(--text-xl);
  }

  .decision-status {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .player-search-trigger {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .player-search-trigger:hover {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
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
    gap: 8px;
  }

  .decision-actions > button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 7px 10px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .decision-actions > button:hover {
    border-color: var(--accent-border);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text-primary);
  }

  .decision-actions > button.active {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
  }

  .decision-actions > .analysis-trigger,
  .decision-actions > .analysis-trigger:hover,
  .decision-actions > .analysis-trigger.active {
    border-color: transparent;
    background: transparent;
  }

  .decision-actions > .analysis-trigger:hover,
  .decision-actions > .analysis-trigger.active {
    color: var(--text-primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .decision-actions :global(.preference-trigger) {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
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

  .strategy-glance > button {
    display: inline-flex;
    align-items: center;
    margin-left: auto;
    gap: 6px;
    border: 0;
    background: transparent;
    padding: 3px 0;
    color: var(--accent);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .strategy-glance > button:hover {
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

  .alternatives-content {
    border-top: 1px solid var(--border);
    padding-top: 2px;
  }

  .candidate-list {
    display: grid;
    gap: 0;
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

    .decision-status {
      justify-content: flex-start;
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

    .strategy-glance > button {
      width: 100%;
      margin-left: 0;
      justify-content: flex-start;
    }
  }
</style>
