<script lang="ts">
  import type { AiRequestProgress } from "../api";
  import { tick } from "svelte";
  import { CANCEL_REQUEST_HELP, createAiConversation } from "../ai-conversation.svelte";
  import { errorCopy } from "../error-copy";
  import { followNewest } from "../thread-scroll";
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
    onAsk: (question: string, conversationHistory: AiConversationMessage[], progress?: AiRequestProgress) => Promise<DraftAskResult>;
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
  let composerElement = $state<HTMLInputElement>();
  let sendButton = $state<HTMLButtonElement>();

  $effect(() => {
    if (!conversation.isAsking && document.activeElement === sendButton) composerElement?.focus();
  });
  let panelElement: HTMLElement;

  const providerReady = $derived(
    providerStatus?.id === "codex-app-server" && providerStatus.configured,
  );
  const providerLabel = $derived(providerReady ? providerStatus?.label ?? "Assistant" : "Assistant not set up");
  const suggestedQuestions = $derived(buildSuggestedQuestions(draftState, recommendation, hasImportedRankings, showPlaceholderWarning));
  const contextSummary = $derived(buildAiPanelContextSummary(draftState, recommendation, hasImportedRankings, hasSeasonProjections, hasImportedAdp, showPlaceholderWarning));
  const providerContextTitle = $derived(
    providerReady
      ? `Board context: ${contextSummary.league}; ${contextSummary.starters}; ${contextSummary.data}`
      : providerLabel,
  );
  const conversation = createAiConversation({
    ask: (nextQuestion, history, progress) => onAsk(nextQuestion, history, progress),
    fallbackError: errorCopy.draftAnswer,
  });
  const newest = $derived.by(() => {
    const last = conversation.messages.at(-1);
    return last ? { id: last.id, status: last.status } : null;
  });
  const boardChanged = $derived(
    Boolean(conversation.messages.length > 0 && conversationPick !== null && draftState && conversationPick !== draftState.currentPick),
  );

  function submit(overrideQuestion?: string) {
    if (!providerReady) return;
    expanded = true;
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
    composerElement?.focus();
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

<article class="panel ask-panel" class:expanded bind:this={panelElement}>
  <button class="ask-toggle" type="button" aria-label="Ask about this draft" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
    <Icon name="message" size={17} />
    <span class="ask-heading">
      <h2>Ask Assistant</h2>
      <span class:offline={!providerReady} class="provider-readiness" title={providerContextTitle}>
        {providerReady ? "Context ready" : providerLabel}
      </span>
    </span>
    <Icon name="chevron-right" size={14} />
  </button>

  {#if expanded}
    {#if !providerReady}
      <div class="provider-empty">
        <div>
          <strong>Set up the Assistant to ask draft questions</strong>
          <span>Imported rankings and projections will be supplied as grounding evidence once the Assistant is set up.</span>
        </div>
        {#if onOpenSettings}
          <button class="btn btn-primary" type="button" onclick={onOpenSettings}>Open Assistant settings</button>
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

      {#if conversation.messages.length > 0}
        <div class="conversation" role="log" aria-label="Draft conversation" aria-live="polite" use:followNewest={newest}>
          {#each conversation.messages as message (message.id)}
            <AiMessageBubble
              {message}
              answerNumber={conversation.answerNumber(message.id)}
              onCopy={conversation.copy}
              onRetry={() => submit(conversation.questionFor(message.id))}
              onApplyStrategyProposal={(proposal) => applyStrategyProposal(message.id, proposal)}
            />
          {/each}
        </div>
        {#if conversation.copied}
          <p class="copy-note">Copied response.</p>
        {/if}
      {/if}
    {/if}
  {/if}

  {#if providerReady}
    <div class="command-bar">
      <div class="composer">
        <input
          bind:this={composerElement}
          aria-label="Ask about your draft"
          bind:value={conversation.question}
          onkeydown={handleKeydown}
          placeholder={conversation.messages.length > 0
            ? "Ask a follow-up about this draft."
            : "Ask who to draft, compare players, or test a what-if."}
        />
        <button bind:this={sendButton} class="composer-send" class:composer-cancel={conversation.isAsking}
          aria-label={conversation.isAsking ? "Cancel" : "Ask Assistant"} type="button"
          title={conversation.isAsking ? CANCEL_REQUEST_HELP : undefined}
          disabled={!conversation.isAsking && !conversation.question.trim()}
          onclick={() => conversation.isAsking ? conversation.cancel() : submit()}
        >{conversation.isAsking ? "Cancel" : "Ask"}</button>
      </div>
      {#if conversation.messages.length === 0}
        <SuggestedQuestions questions={suggestedQuestions.slice(0, 3)} disabled={conversation.isAsking} onChoose={chooseSuggestion} />
      {/if}
    </div>
  {/if}
</article>

<style>
  /* DOM order stays toggle, thread, composer so the composer never remounts and focus survives expanding. */
  .ask-panel {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    padding: 0;
    overflow: hidden;
  }

  .ask-panel > :global(*) {
    min-width: 0;
  }

  .ask-panel.expanded {
    grid-template-columns: minmax(0, 1fr);
  }

  .ask-toggle {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border: 0;
    background: transparent;
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .ask-toggle:hover {
    background: var(--surface-raised);
  }

  .ask-toggle > :global(.icon:first-child) {
    color: var(--info);
  }

  .ask-toggle > :global(.icon:last-child) {
    color: var(--text-muted);
    transition: transform var(--transition-base);
  }

  .ask-toggle[aria-expanded="true"] > :global(.icon:last-child) {
    transform: rotate(90deg);
  }

  .ask-heading {
    display: grid;
    gap: 2px;
  }

  .ask-heading h2 {
    font-size: var(--text-lg);
    white-space: nowrap;
  }

  .ask-panel.expanded .ask-toggle {
    border-bottom: 1px solid var(--border);
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

  @media (max-width: 520px) {
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
    font-weight: 600;
  }

  .conversation {
    display: grid;
    gap: 10px;
    max-height: clamp(300px, 50vh, 600px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: var(--space-4) var(--space-5);
  }

  .command-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5) var(--space-3) var(--space-2);
  }

  .expanded .command-bar {
    padding-left: var(--space-5);
  }

  .expanded .conversation + .command-bar,
  .expanded .copy-note + .command-bar {
    border-top: 1px solid var(--border);
  }

  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    border: 1px solid var(--border-input);
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
    font-weight: 600;
  }

  .composer-send:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .composer-cancel {
    border: 1px solid var(--border-strong);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .composer-cancel:hover {
    background: var(--surface-hover);
  }

  .provider-readiness {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
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

  @media (max-width: 1100px) {
    .ask-panel {
      grid-template-columns: minmax(0, 1fr);
    }

    .command-bar {
      grid-template-columns: minmax(0, 1fr);
      padding-left: var(--space-5);
      padding-top: 0;
    }

    .expanded .command-bar {
      padding-top: var(--space-3);
    }
  }

  @media (max-width: 520px) {
    .ask-toggle {
      padding: var(--space-3) var(--space-4);
    }

    .board-change-note {
      align-items: flex-start;
      flex-direction: column;
    }

    .command-bar,
    .expanded .command-bar {
      padding-inline: var(--space-4);
    }

    .conversation {
      padding: var(--space-4);
    }
  }
</style>
