<script lang="ts">
  import type { AiRequestPhase, AiRequestProgress } from "../api";
  import { draftStateRevision } from "@sleeper-draft-assistant/shared";
  import Icon from "./Icon.svelte";
  import PlayerPreferenceMenu from "./PlayerPreferenceMenu.svelte";
  import PositionChip from "./PositionChip.svelte";
  import RequestPhase from "./RequestPhase.svelte";
  import { currentAiDraftStrategy, playerCardFacts, recommendationTurnPresentation } from "../ai-panel";
  import { errorCopy } from "../error-copy";
  import { formatConfidence, formatDraftPick, rosterFitLabel, sourceLabel } from "../format";
  import type { AiDraftStrategyPayload, DraftOption, DraftState, PlayerPreferenceLevel, PlayerPreferences } from "../types";

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
    onAskAboutCandidate,
    onRequestAiStrategy,
    draftState,
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
    onAskAboutCandidate?: (playerName: string, recommendedPlayerName: string) => void;
    onRequestAiStrategy?: (automatic?: boolean, progress?: AiRequestProgress) => Promise<AiDraftStrategyPayload>;
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
  let completedBoardRevision = $state("");
  let aiStrategyRequestId = 0;
  let strategyController: AbortController | undefined;
  let explicitRefresh = false;
  let phase: AiRequestPhase = $state("thinking");
  $effect(() => {
    currentRequestKey;
    return () => { strategyController?.abort(); };
  });
  const boardRevision = $derived(draftStateRevision(draftState));
  const currentRequestKey = $derived(`${currentPick}:${strategyRequestKey}:${boardRevision}`);
  const currentAiStrategy = $derived(
    aiEnabled ? currentAiDraftStrategy(aiStrategy, currentPick) : null,
  );
  const displayedAiStrategy = $derived(aiEnabled ? (currentAiStrategy ?? aiStrategy) : null);
  const isPreviousRecommendation = $derived(
    displayedAiStrategy !== null
      && (displayedAiStrategy.pickNumber !== currentPick || completedBoardRevision !== boardRevision),
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
      : turnPresentation?.headline ?? "Assistant",
  );
  const timingSummary = $derived(turnPresentation?.timing ?? null);
  const activeConfidence = $derived(
    isPreviousRecommendation ? null : displayedAiStrategy?.decision.confidence ?? null,
  );
  const turnContext = $derived.by(() => {
    const confidence = activeConfidence
      ? formatConfidence(activeConfidence)
      : null;
    if (!timingSummary) return confidence;
    if (!confidence) return timingSummary;
    const [lead, ...rest] = timingSummary.split(" · ");
    return [lead, confidence, ...rest].join(" · ");
  });
  function contingencyLabel(candidate: DraftOption): string {
    const nextUserPick = turnPresentation?.nextUserPick;
    if (nextUserPick === null || nextUserPick === undefined || !turnPresentation?.contingent) return "Assistant alternative";
    const turnRangeStart = Math.max(currentPick, nextUserPick - 2);
    const marketPoint = candidate.player.importedRank
      ?? candidate.player.realTimeAdp
      ?? candidate.player.adp;
    return marketPoint !== null && marketPoint !== undefined && marketPoint >= turnRangeStart
      ? `${formatDraftPick(nextUserPick, draftState.settings.teams)} range`
      : "Elite faller";
  }
  function retryAiStrategy() {
    explicitRefresh = true;
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
    const requestKey = currentRequestKey;
    const requestedBoardRevision = boardRevision;
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
      strategyController?.abort();
      strategyController = new AbortController();
      const automatic = !explicitRefresh;
      explicitRefresh = false;
      void onRequestAiStrategy(automatic, { signal: strategyController.signal, onPhase: (nextPhase) => {
        if (requestId === aiStrategyRequestId && requestKey === currentRequestKey) phase = nextPhase;
      } })
        .then((payload) => {
          if (requestId === aiStrategyRequestId && requestKey === currentRequestKey && payload.pickNumber === currentPick) {
            aiStrategy = payload;
            completedBoardRevision = requestedBoardRevision;
          }
        })
        .catch((error) => {
          if (requestId === aiStrategyRequestId && requestKey === currentRequestKey) {
            aiStrategyError = error instanceof Error ? error.message : errorCopy.draftStrategy;
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

{#snippet placeholderWarning()}
  {#if showPlaceholderWarning}
    <div class="callout callout-warning placeholder-warning">
      <Icon name="alert" size={15} />
      <div>
        <strong>Player value data is incomplete.</strong>
        <span>The Assistant can reason from the draft state, but Sleeper search ranks are only placeholder valuation evidence.</span>
        {#if onOpenRankings}
          <button class="btn btn-secondary" type="button" onclick={onOpenRankings}>Import rankings</button>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<article class="panel recommendation-panel" aria-label="Assistant call">
  <div class="panel-heading">
    <div class="decision-heading">
      {#if turnPresentation || isPreviousRecommendation}<span>Assistant recommends</span>{/if}
      <h2 class:decision={displayedAiStrategy !== null}>{activeHeadline}</h2>
    </div>
  </div>

  {#if displayedAiStrategy}
    {@const candidate = displayedAiStrategy.recommendedCandidate}
    <div class:previous={isPreviousRecommendation} class="ai-strategy" aria-live="polite">
      {#if isPreviousRecommendation}
        <span class="previous-recommendation-label">Previous recommendation</span>
      {/if}
      {#if isLoadingAiStrategy}
        <div class="strategy-refresh-status"><RequestPhase {phase} /></div>
      {/if}
      {#if aiStrategyError}
        <div class="strategy-refresh-error">
          <div>
            <strong>Recommendation update failed</strong>
            <span>{aiStrategyError}</span>
          </div>
          <button class="btn btn-secondary" type="button" onclick={retryAiStrategy}>Retry recommendation</button>
        </div>
      {/if}
      {#if turnContext}<p class="turn-context">{turnContext}</p>{/if}
      {@render placeholderWarning()}
      <div class="player-card">
        <PositionChip position={candidate.player.position} size="lg" />
        <div class="player-identity">
          <strong>{candidate.player.name}</strong>
          <ul class="player-facts">
            <li>{candidate.player.team || "FA"}</li>
            {#each playerCardFacts(candidate) as fact (fact.label)}
              <li>{fact.label} <b>{fact.value}</b></li>
            {/each}
            <li>{rosterFitLabel(candidate.rosterFit)}</li>
          </ul>
        </div>
        <button
          class="btn btn-primary"
          type="button"
          disabled={strategyInteractionDisabled}
          aria-label={`Ask Assistant about drafting ${candidate.player.name}`}
          title={`Ask about drafting ${candidate.player.name}`}
          onclick={() => discussCandidate(candidate.player.name)}
        >
          <Icon name="message" size={14} />
          Ask Assistant
        </button>
      </div>
      <p class="decision-summary">{displayedAiStrategy.decision.summary}</p>
      <div class="decision-actions">
        <button
          class="analysis-trigger"
          class:active={analysisOpen}
          type="button"
          disabled={strategyInteractionDisabled}
          aria-expanded={analysisOpen}
          onclick={() => (analysisOpen = !analysisOpen)}
        >
          Why this call
          <Icon name="chevron-right" size={12} />
        </button>
        <PlayerPreferenceMenu
          playerId={candidate.player.id}
          playerName={candidate.player.name}
          preference={playerPreferences[candidate.player.id] ?? null}
          onSetPreference={strategyInteractionDisabled ? undefined : onSetPreference}
        />
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
          {#if displayedAiStrategy.decision.newsSources?.length}
            <section>
              <h3>News sources checked</h3>
              <ul>
                {#each displayedAiStrategy.decision.newsSources as source}
                  <li>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>
                    · Reported {source.reportedAt ?? "date unavailable"} · Checked {source.checkedAt}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
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
              <span>{candidate.player.team} · {candidate.player.position}</span>
              <span>{rosterFitLabel(candidate.rosterFit)}</span>
              <span>{sourceLabel(candidate)}</span>
            </div>
            {#if candidate.evidence.length > 0}
              <ul>
                {#each candidate.evidence as evidence}
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
      {#if alternativeAiCandidates.length > 0}
        <aside class="fallback-ladder" aria-label="Fallback order">
          <h3>If {candidate.player.name} is gone</h3>
          <ol>
            {#each alternativeAiCandidates as alternative, index (alternative.player.id)}
              <li>
                <span class="fallback-rank">{index + 1}</span>
                <span class="fallback-player">
                  <strong>{alternative.player.name}</strong>
                  <small>{alternative.player.team} · {alternative.player.position} · {contingencyLabel(alternative)}</small>
                </span>
              </li>
            {/each}
          </ol>
        </aside>
      {/if}
      <div class="strategy-glance" aria-label="Draft strategy summary">
        <span>Next turn: <strong>{displayedAiStrategy.decision.plan.nextTurnPriorities.join(" / ") || "Reassess board"}</strong></span>
        <span>Can wait: <strong>{displayedAiStrategy.decision.plan.positionsThatCanWait.join(" / ") || "Nothing identified"}</strong></span>
      </div>
    </div>
  {:else if !aiEnabled}
    {@render placeholderWarning()}
    <div class="empty-state" aria-live="polite">
      <Icon name="message" size={20} />
      <div>
        <strong>Set up the Assistant for draft strategy</strong>
        <span>The draft board and imported data remain available, but this app does not generate local pick recommendations.</span>
      </div>
      {#if onOpenSettings}
        <button class="btn btn-primary" type="button" onclick={onOpenSettings}>Open Assistant settings</button>
      {/if}
    </div>
  {:else if isLoadingAiStrategy}
    {@render placeholderWarning()}
    <div class="ai-strategy-pending" aria-live="polite">
      <strong><RequestPhase {phase} /></strong>
      <span>The Assistant can search the complete available-player pool while it evaluates the current roster and draft room.</span>
    </div>
  {:else if aiStrategyEnabled && aiStrategyError}
    {@render placeholderWarning()}
    <div class="callout callout-warning" aria-live="polite">
      <div>
        <strong>Assistant strategy unavailable</strong>
        <span>{aiStrategyError}</span>
        <button class="btn btn-secondary" type="button" onclick={retryAiStrategy}>Retry Assistant strategy</button>
      </div>
    </div>
  {:else if !aiStrategyEnabled}
    {@render placeholderWarning()}
    <div class="empty-state" aria-live="polite">
      <Icon name="pause" size={20} />
      <div>
        <strong>Automatic Assistant strategy is paused</strong>
        <span>Enable automatic draft strategy in Settings or use Ask about this draft for an on-demand decision.</span>
      </div>
      {#if onOpenSettings}
        <button class="btn btn-secondary" type="button" onclick={onOpenSettings}>Open Assistant settings</button>
      {/if}
    </div>
  {:else}
    {@render placeholderWarning()}
    <div class="empty-state" aria-live="polite">
      <Icon name="clock" size={20} />
      <div>
        <strong>Assistant strategy will update near your turn</strong>
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
    margin-bottom: 0;
  }

  .panel-heading h2 {
    margin-top: 3px;
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .panel-heading h2.decision {
    font-size: var(--text-3xl);
    letter-spacing: -0.015em;
    line-height: 1.15;
  }

  .decision-heading {
    display: grid;
    gap: 4px;
  }

  .decision-heading > span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
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
    font-weight: 600;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .empty-state > div {
    display: grid;
    gap: 3px;
  }

  .ai-strategy {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
  }

  .player-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: var(--space-3) var(--space-4);
  }

  .player-identity {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .player-identity strong {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .ai-strategy .player-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-3);
    margin: 0;
    padding: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    list-style: none;
  }

  .ai-strategy .player-facts b {
    color: var(--text-primary);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
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
    font-size: var(--text-sm);
  }

  .strategy-refresh-error span {
    color: var(--text-secondary);
  }

  .strategy-refresh-error .btn {
    flex: 0 0 auto;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
  }

  .previous-recommendation-label {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    padding: 4px 8px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .ai-strategy.previous > :not(.strategy-refresh-status, .strategy-refresh-error, .previous-recommendation-label, .placeholder-warning) {
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
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .fallback-ladder ol {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fallback-ladder li {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    padding: var(--space-2) var(--space-3);
  }

  .fallback-rank {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .fallback-player {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .fallback-player strong {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fallback-player small {
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-strategy-pending {
    display: grid;
    gap: 6px;
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    padding: 14px;
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
    font-weight: 700;
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
    font-size: var(--text-lg);
    font-weight: 400;
    line-height: 1.5;
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
    font-weight: 600;
  }

  .decision-actions > button:hover {
    background: transparent;
    color: var(--text-primary);
  }

  .decision-actions > button.active {
    background: transparent;
    color: var(--accent);
  }

  .decision-actions > button > :global(.icon) {
    transition: transform var(--transition-base);
  }

  .decision-actions > button.active > :global(.icon) {
    transform: rotate(90deg);
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
    font-weight: 700;
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

  @media (max-width: 760px) {
    .player-card {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .player-card .btn {
      grid-column: 1 / -1;
    }

    .fallback-ladder ol {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 520px) {
    .panel-heading {
      flex-direction: column;
      gap: 8px;
    }

    .panel-heading h2.decision {
      font-size: var(--text-2xl);
      line-height: 1.2;
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
