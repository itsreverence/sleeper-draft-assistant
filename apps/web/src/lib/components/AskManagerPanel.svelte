<script lang="ts">
  import type { AiRequestProgress } from "../api";
  import { tick, type Snippet } from "svelte";
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
    placeholder = "Ask about this draft…",
    action,
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
    placeholder?: string;
    action?: Snippet;
  } = $props();

  export function focusComposer() {
    composerElement?.focus({ preventScroll: true });
  }

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
  let suggestionsOpen = $state(false);
  let pointerActive = false;

  // Keyboard focus anywhere keeps the chips reachable; a mouse click on Board does not summon them.
  function handleFocusIn(event: FocusEvent) {
    if (event.target === composerElement || !pointerActive) suggestionsOpen = true;
  }

  function handleFocusOut(event: FocusEvent) {
    if (!panelElement.contains(event.relatedTarget as Node | null)) suggestionsOpen = false;
  }

  const providerReady = $derived(
    providerStatus?.id === "codex-app-server" && providerStatus.configured,
  );
  const suggestedQuestions = $derived(buildSuggestedQuestions(draftState, recommendation, hasImportedRankings, showPlaceholderWarning));
  const contextSummary = $derived(buildAiPanelContextSummary(draftState, recommendation, hasImportedRankings, hasSeasonProjections, hasImportedAdp, showPlaceholderWarning));
  const boardContextTitle = $derived(`Board context: ${contextSummary.league}; ${contextSummary.starters}; ${contextSummary.data}`);
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

<section
  class="ask-panel"
  class:expanded
  aria-label="Ask the Assistant"
  bind:this={panelElement}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
  onpointerdown={() => (pointerActive = true)}
  onpointerup={() => (pointerActive = false)}
  onpointercancel={() => (pointerActive = false)}
>
  {#if expanded && providerReady}
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

  <div class="command-bar">
    <div class="composer">
      {#if providerReady}
        <input
          bind:this={composerElement}
          aria-label="Ask about your draft"
          title={boardContextTitle}
          bind:value={conversation.question}
          onkeydown={handleKeydown}
          placeholder={conversation.messages.length > 0 ? "Ask a follow-up about this draft." : placeholder}
        />
        <button bind:this={sendButton} class="composer-send" class:composer-cancel={conversation.isAsking}
          class:idle={!conversation.isAsking && !conversation.question.trim()}
          aria-label={conversation.isAsking ? "Cancel" : "Ask Assistant"} type="button"
          title={conversation.isAsking ? CANCEL_REQUEST_HELP : undefined}
          disabled={!conversation.isAsking && !conversation.question.trim()}
          onclick={() => conversation.isAsking ? conversation.cancel() : submit()}
        >{conversation.isAsking ? "Cancel" : "Ask"}</button>
      {:else}
        <span class="provider-missing">Set up the Assistant to ask draft questions</span>
        {#if onOpenSettings}
          <button class="composer-text-action" type="button" onclick={onOpenSettings}>Open Assistant settings</button>
        {/if}
      {/if}
      <div class="composer-actions">
        {#if conversation.messages.length > 0}
          <button class="composer-text-action" type="button" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
            Conversation
            <Icon name="chevron-right" size={12} />
          </button>
        {/if}
        {@render action?.()}
      </div>
    </div>
    {#if providerReady && conversation.messages.length === 0}
      <div hidden={!suggestionsOpen}>
        <SuggestedQuestions questions={suggestedQuestions.slice(0, 3)} disabled={conversation.isAsking} onChoose={chooseSuggestion} />
      </div>
    {/if}
  </div>
</section>

<style>
  /* DOM order stays thread, composer so the composer never remounts and focus survives expanding. */
  .ask-panel {
    min-width: 0;
  }

  .ask-panel.expanded {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    overflow: hidden;
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
    gap: var(--space-2);
  }

  .expanded .command-bar {
    padding: var(--space-3);
  }

  .expanded .conversation + .command-bar,
  .expanded .copy-note + .command-bar {
    border-top: 1px solid var(--border);
  }

  .composer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
    min-height: 44px;
    border: 1px solid var(--border-input);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
  }

  .composer:focus-within {
    border-color: var(--accent-border);
    box-shadow: 0 0 0 1px var(--accent-border);
  }

  .composer input {
    flex: 1 1 200px;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    padding: var(--space-1) 0;
    color: var(--text-primary);
    font-size: var(--text-base);
  }

  .composer input::placeholder {
    color: var(--text-muted);
  }

  .provider-missing {
    flex: 1 1 200px;
    color: var(--text-muted);
    font-size: var(--text-md);
  }

  .composer-send {
    min-width: 52px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    padding: 6px 10px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .composer-send.idle {
    visibility: hidden;
  }

  .composer-send:hover,
  .composer-cancel:hover {
    background: var(--surface-hover);
  }

  .composer-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
  }

  .composer-text-action,
  .composer-actions :global(.composer-action) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: var(--space-1);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .composer-text-action:hover,
  .composer-actions :global(.composer-action:hover) {
    color: var(--text-primary);
  }

  .composer-text-action[aria-expanded="true"] > :global(.icon),
  .composer-actions :global(.composer-action[aria-expanded="true"] .icon) {
    transform: rotate(90deg);
  }

  @media (max-width: 520px) {
    .board-change-note {
      align-items: flex-start;
      flex-direction: column;
    }

    .composer input {
      flex-basis: 140px;
    }

    .composer-send.idle {
      display: none;
    }

    .conversation {
      padding: var(--space-4);
    }
  }
</style>
