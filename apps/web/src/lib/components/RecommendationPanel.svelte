<script lang="ts">
  import Icon from "./Icon.svelte";
  import CandidateCard from "./CandidateCard.svelte";
  import DecisionHistoryPanel from "./DecisionHistoryPanel.svelte";
  import { currentAiDraftStrategy } from "../ai-panel";
  import type { AiDraftStrategyPayload, DecisionSnapshot, PlayerPreferenceLevel, PlayerPreferences } from "../types";

  let {
    showPlaceholderWarning = false,
    playerPreferences = {},
    onSetPreference,
    onClearPreferences,
    onOpenRankings,
    onOpenSettings,
    currentPick,
    aiEnabled = false,
    aiStrategyEnabled = false,
    shouldRequestAiStrategy = false,
    strategyRequestKey = "",
    strategyHistory = [],
    isLoadingStrategyHistory = false,
    strategyHistoryError = "",
    onAskAboutCandidate,
    onRequestAiStrategy,
  }: {
    showPlaceholderWarning?: boolean;
    playerPreferences?: PlayerPreferences;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onClearPreferences?: () => void;
    onOpenRankings?: () => void;
    onOpenSettings?: () => void;
    currentPick: number;
    aiEnabled?: boolean;
    aiStrategyEnabled?: boolean;
    shouldRequestAiStrategy?: boolean;
    strategyRequestKey?: string;
    strategyHistory?: DecisionSnapshot[];
    isLoadingStrategyHistory?: boolean;
    strategyHistoryError?: string;
    onAskAboutCandidate?: (playerName: string, recommendedPlayerName: string) => void;
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
  const currentAiStrategy = $derived(
    aiEnabled ? currentAiDraftStrategy(aiStrategy, currentPick) : null,
  );
  const aiCandidates = $derived.by(() => {
    const strategy = currentAiStrategy;
    if (!strategy) {
      return [];
    }
    return Array.from(
      new Map(
        [strategy.recommendedCandidate, ...strategy.alternativeCandidates]
          .map((candidate) => [candidate.player.id, candidate]),
      ).values(),
    );
  });
  const primaryAiCandidates = $derived(aiCandidates.slice(0, 3));
  const additionalAiCandidates = $derived(aiCandidates.slice(3));
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
    <h2><Icon name="target" size={18} /> {activeHeadline}</h2>
    {#if activeConfidence}
      <span class="pill pill-{confidenceTone}">{activeConfidence} confidence</span>
    {/if}
  </div>

  {#if preferenceCount > 0}
    <div class="preference-summary">
      <div>
        <strong>{preferenceSummary}</strong>
        <span>Applied to AI strategy for this draft.</span>
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
      <div class="ai-strategy-heading">
        <strong>AI draft strategy</strong>
        <span>{currentAiStrategy.decision.verdict}</span>
      </div>
      <p>{currentAiStrategy.decision.summary}</p>
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
          <div class="plan-meta">
            <span>Updated at pick {currentAiStrategy.decision.plan.updatedAtPick}</span>
            <DecisionHistoryPanel
              snapshots={strategyHistory}
              isLoading={isLoadingStrategyHistory}
              error={strategyHistoryError}
            />
          </div>
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

  {#if currentAiStrategy}
    <div class="candidate-section-heading">
      <strong>AI player options</strong>
      <span>Ordered by the current AI strategy. Imported values remain visible as grounding evidence.</span>
    </div>
    <div class="candidate-list">
      {#each primaryAiCandidates as candidate, index (candidate.player.id)}
        <CandidateCard
          {candidate}
          rank={index + 1}
          featured={index === 0}
          presentation={index === 0 ? "ai-pick" : "ai-alternative"}
          aiReason={index === 0 ? currentAiStrategy.decision.reasons[0] ?? "" : ""}
          preference={playerPreferences[candidate.player.id] ?? null}
          {onSetPreference}
          onDiscuss={discussCandidate}
        />
      {/each}
    </div>
    {#if additionalAiCandidates.length > 0}
      <details class="more-candidates">
        <summary>Show {additionalAiCandidates.length} more AI alternative{additionalAiCandidates.length === 1 ? "" : "s"}</summary>
        <div class="candidate-list">
          {#each additionalAiCandidates as candidate, index (candidate.player.id)}
            <CandidateCard
              {candidate}
              rank={index + primaryAiCandidates.length + 1}
              presentation="ai-alternative"
              preference={playerPreferences[candidate.player.id] ?? null}
              {onSetPreference}
              onDiscuss={discussCandidate}
            />
          {/each}
        </div>
      </details>
    {/if}
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

  .preference-summary > div,
  .empty-state > div,
  .ai-strategy-pending > div {
    display: grid;
    gap: 3px;
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
    font-weight: 900;
    text-transform: uppercase;
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

  .ai-strategy-pending {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  .ai-strategy-heading,
  .draft-plan-heading {
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

  .ai-strategy p {
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

  .ai-strategy summary,
  .more-candidates summary {
    cursor: pointer;
    font-weight: 800;
  }

  .draft-plan {
    display: grid;
    gap: 9px;
    border-top: 1px solid var(--accent-border);
    padding-top: 11px;
  }

  .plan-meta {
    display: flex;
    align-items: center;
    gap: 10px;
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

  .candidate-section-heading {
    display: grid;
    gap: 3px;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }

  .candidate-section-heading strong {
    font-size: var(--text-sm);
  }

  .candidate-section-heading span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
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
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .more-candidates[open] summary {
    margin-bottom: 12px;
  }

  @media (max-width: 680px) {
    .draft-plan-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }

    .plan-priorities {
      grid-template-columns: 1fr;
    }

    .plan-priorities > div + div {
      border-top: 1px solid var(--accent-border);
      border-left: 0;
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
  }
</style>
