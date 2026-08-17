<script lang="ts">
  import { tick } from "svelte";
  import { createAiConversation } from "../ai-conversation.svelte";
  import { buildAiPanelContextSummary, buildSuggestedQuestions } from "../ai-panel";
  import type { AiConversationMessage, AiProviderStatus, DraftAskResult, DraftRecommendation, DraftState, DraftStrategyProposal } from "../types";
  import AiMessageBubble from "./AiMessageBubble.svelte";
  import Icon from "./Icon.svelte";
  import SuggestedQuestions from "./SuggestedQuestions.svelte";

  let {
    onAsk,
    providerStatus = null,
    hasImportedRankings = false,
    hasSeasonProjections = false,
    hasImportedAdp = false,
    showPlaceholderWarning = false,
    draftState = null,
    draftIdentity = "",
    recommendation = null,
    onOpenSettings,
    promptRequest = null,
    onApplyStrategyProposal,
  }: {
    onAsk: (question: string, conversationHistory: AiConversationMessage[]) => Promise<DraftAskResult>;
    providerStatus?: AiProviderStatus | null;
    hasImportedRankings?: boolean;
    hasSeasonProjections?: boolean;
    hasImportedAdp?: boolean;
    showPlaceholderWarning?: boolean;
    draftState?: DraftState | null;
    draftIdentity?: string;
    recommendation?: DraftRecommendation | null;
    onOpenSettings?: () => void;
    promptRequest?: { id: number; question: string } | null;
    onApplyStrategyProposal?: (proposal: DraftStrategyProposal) => Promise<void>;
  } = $props();

  let expanded = $state(false);
  let conversationPick: number | null = $state(null);
  let conversationDraftIdentity = $state("");
  let handledPromptRequestId = 0;
  let panelElement: HTMLElement;

  const providerReady = $derived(
    providerStatus?.id === "codex-app-server" && providerStatus.configured,
  );
  const providerLabel = $derived(providerReady ? providerStatus?.label ?? "AI manager" : "No AI provider");
  const suggestedQuestions = $derived(buildSuggestedQuestions(draftState, recommendation, hasImportedRankings, showPlaceholderWarning));
  const contextSummary = $derived(buildAiPanelContextSummary(draftState, recommendation, hasImportedRankings, hasSeasonProjections, hasImportedAdp, showPlaceholderWarning));
  const providerContextTitle = $derived(
    providerReady
      ? `Board context: ${contextSummary.league}; ${contextSummary.starters}; ${contextSummary.data}`
      : providerLabel,
  );
  const conversation = createAiConversation({
    ask: (nextQuestion, history) => onAsk(nextQuestion, history),
    loadingMessage: "Thinking through your draft context...",
    fallbackError: "The manager could not answer because the draft state is unavailable.",
  });
  const boardChanged = $derived(
    Boolean(conversation.messages.length > 0 && conversationPick !== null && draftState && conversationPick !== draftState.currentPick),
  );

  function submit(overrideQuestion?: string) {
    if (!providerReady) return;
    conversationPick = draftState?.currentPick ?? null;
    void conversation.submit(overrideQuestion);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  function chooseSuggestion(nextQuestion: string) {
    submit(nextQuestion);
  }

  function clearConversation() {
    conversation.clear(true);
    conversationPick = null;
  }

  async function applyStrategyProposal(messageId: string, proposal: DraftStrategyProposal) {
    if (!onApplyStrategyProposal) return;
    try {
      await onApplyStrategyProposal(proposal);
      conversation.markStrategyProposalApplied(messageId);
    } catch {
      // The strategy drawer surfaces the persistence error and leaves this proposal retryable.
    }
  }

  $effect(() => {
    const nextDraftIdentity = draftIdentity;
    if (conversationDraftIdentity && nextDraftIdentity !== conversationDraftIdentity) {
      conversationPick = null;
    }
    conversation.syncIdentity(nextDraftIdentity);
    conversationDraftIdentity = nextDraftIdentity;
  });

  $effect(() => {
    const request = promptRequest;
    if (!request || request.id === handledPromptRequestId) {
      return;
    }

    handledPromptRequestId = request.id;
    expanded = true;
    conversation.question = request.question;
    void tick().then(() => {
      panelElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (providerReady) {
        void submit(request.question);
      }
    });
  });
</script>

<article class="panel ask-panel" bind:this={panelElement}>
  <button class="ask-toggle" type="button" aria-label="Ask about this draft" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
    <div class="ask-heading">
      <Icon name="message" size={17} />
      <div>
        <h2>Ask Codex</h2>
        <span>Compare picks or test a scenario</span>
      </div>
    </div>
    <div class="ask-status">
      <span class:offline={!providerReady} class="provider-readiness" title={providerContextTitle}>
        {providerReady ? "Context ready" : providerLabel}
      </span>
      <Icon name="chevron-right" size={14} />
    </div>
  </button>

  {#if expanded}
    <div class="ask-content">
      {#if !providerReady}
        <div class="provider-empty">
          <div>
            <strong>Connect an AI provider to ask draft questions</strong>
            <span>Imported rankings and projections will be supplied as grounding evidence once Codex is connected.</span>
          </div>
          {#if onOpenSettings}
            <button class="btn btn-primary" type="button" onclick={onOpenSettings}>Open AI settings</button>
          {/if}
        </div>
      {:else}
      {#if showPlaceholderWarning}
        <p class="callout callout-warning compact-callout">
          Player values are using Sleeper search ranks until rankings are imported.
        </p>
      {/if}

      {#if boardChanged}
        <div class="board-change-note">
          <div>
            <strong>Board changed since the last answer</strong>
            <span>New questions use pick {draftState?.currentPick}. Earlier answers remain visible for context.</span>
          </div>
          <button type="button" onclick={clearConversation}>Start fresh</button>
        </div>
      {/if}

      <div class:has-conversation={conversation.messages.length > 0} class="chat-workspace">
        {#if conversation.messages.length > 0}
        <div class="conversation" role="log" aria-label="Draft conversation" aria-live="polite">
          {#each conversation.messages as message (message.id)}
            <AiMessageBubble
              {message}
              onCopy={conversation.copy}
              onRetry={() => submit(conversation.lastQuestion)}
              onApplyStrategyProposal={(proposal) => applyStrategyProposal(message.id, proposal)}
            />
          {/each}
        </div>
        {#if conversation.copied}
          <p class="copy-note">Copied response.</p>
        {/if}
        {/if}
        <div class="command-bar">
          {#if conversation.messages.length === 0}
            <SuggestedQuestions questions={suggestedQuestions.slice(0, 3)} disabled={conversation.isAsking} onChoose={chooseSuggestion} />
          {/if}
          <div class="composer">
            <input
              bind:value={conversation.question}
              onkeydown={handleKeydown}
              placeholder={conversation.messages.length > 0
                ? "Ask a follow-up about this draft."
                : "Ask who to draft, compare players, or test a what-if."}
            />
            <button
              class="composer-send"
              aria-label={conversation.isAsking ? "Asking" : "Ask AI"}
              type="button"
              disabled={conversation.isAsking || !conversation.question.trim()}
              onclick={() => submit()}
            >
              {#if conversation.isAsking}<span class="spinner"></span>{/if}
              {conversation.isAsking ? "Asking" : "Send"}
            </button>
          </div>
        </div>
      </div>
      {/if}
    </div>
  {/if}
</article>

<style>
  .ask-panel {
    display: grid;
    gap: 0;
    padding: 0;
    overflow: hidden;
  }

  .ask-toggle {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    align-items: center;
    width: 100%;
    border: 0;
    background: transparent;
    padding: var(--space-4) var(--space-5);
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .ask-toggle:hover {
    background: var(--surface-raised);
  }

  .ask-heading,
  .ask-status {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .ask-heading > :global(.icon) {
    color: var(--info);
  }

  .ask-heading h2 {
    font-size: var(--text-md);
  }

  .ask-heading span {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .ask-status > :global(.icon) {
    color: var(--text-muted);
    transition: transform var(--transition-base);
  }

  .ask-toggle[aria-expanded="true"] .ask-status > :global(.icon) {
    transform: rotate(90deg);
  }

  .ask-content {
    display: grid;
    gap: 0;
    border-top: 1px solid var(--border);
    padding: 0;
  }

  .provider-empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: var(--space-4) var(--space-5);
  }

  .provider-empty > div {
    display: grid;
    gap: 4px;
  }

  .provider-empty span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  @media (max-width: 560px) {
    .provider-empty {
      align-items: stretch;
      flex-direction: column;
    }
  }

  .compact-callout {
    margin: 12px var(--space-5) 0;
    font-size: var(--text-xs);
  }

  .copy-note {
    margin: 0;
    padding: 0 var(--space-5) 10px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .board-change-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--warning-border);
    border-radius: var(--radius-md);
    background: var(--warning-soft);
    padding: 9px 10px;
    margin: 12px var(--space-5) 0;
  }

  .board-change-note > div {
    display: grid;
    gap: 3px;
  }

  .board-change-note strong {
    font-size: var(--text-xs);
  }

  .board-change-note span {
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .board-change-note button {
    flex-shrink: 0;
    border: 0;
    background: transparent;
    color: var(--warning);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .conversation {
    display: grid;
    gap: 10px;
    max-height: 310px;
    overflow: auto;
    padding: var(--space-4) var(--space-5);
  }

  .chat-workspace,
  .command-bar {
    display: grid;
  }

  .command-bar {
    grid-template-columns: auto minmax(300px, 1fr);
    align-items: center;
    gap: 12px;
    padding: 14px var(--space-5) var(--space-4);
  }

  .has-conversation .command-bar {
    grid-template-columns: 1fr;
    border-top: 1px solid var(--border);
  }

  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 5px 6px 5px 12px;
  }

  .composer:focus-within {
    border-color: var(--accent-border);
    box-shadow: 0 0 0 1px var(--accent-border);
  }

  .composer input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  .composer input::placeholder {
    color: var(--text-muted);
  }

  .composer-send {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 58px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent);
    padding: 8px 12px;
    color: var(--text-on-accent);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 850;
  }

  .composer-send:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .provider-readiness {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 750;
  }

  .provider-readiness::before {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    content: "";
  }

  .offline {
    color: var(--danger);
  }

  .offline::before {
    background: var(--danger);
  }

  @media (max-width: 560px) {
    .ask-toggle {
      align-items: flex-start;
      padding: var(--space-4);
    }

    .ask-status .provider-readiness {
      display: none;
    }

    .ask-content {
      padding: 0;
    }

    .board-change-note {
      align-items: flex-start;
      flex-direction: column;
    }

    .command-bar {
      grid-template-columns: 1fr;
      padding: var(--space-4);
    }

    .conversation {
      padding: var(--space-4);
    }
  }
</style>
