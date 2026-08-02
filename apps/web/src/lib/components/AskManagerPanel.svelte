<script lang="ts">
  import { tick } from "svelte";
  import { buildAiPanelContextSummary, buildSuggestedQuestions } from "../ai-panel";
  import type { AiConversationMessage, AiProviderStatus, DraftRecommendation, DraftState } from "../types";
  import AiMessageBubble, { type AiMessage } from "./AiMessageBubble.svelte";
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
    recommendation = null,
    onOpenSettings,
    promptRequest = null,
  }: {
    onAsk: (question: string, conversationHistory: AiConversationMessage[]) => Promise<string>;
    providerStatus?: AiProviderStatus | null;
    hasImportedRankings?: boolean;
    hasSeasonProjections?: boolean;
    hasImportedAdp?: boolean;
    showPlaceholderWarning?: boolean;
    draftState?: DraftState | null;
    recommendation?: DraftRecommendation | null;
    onOpenSettings?: () => void;
    promptRequest?: { id: number; question: string } | null;
  } = $props();

  let question = $state("");
  let messages: AiMessage[] = $state([]);
  let isAsking = $state(false);
  let copied = $state(false);
  let lastQuestion = $state("");
  let expanded = $state(false);
  let conversationPick: number | null = $state(null);
  let conversationDraftId = $state("");
  let handledPromptRequestId = 0;
  let panelElement: HTMLElement;

  const providerReady = $derived(
    providerStatus?.id === "codex-app-server" && providerStatus.configured,
  );
  const providerLabel = $derived(providerReady ? providerStatus?.label ?? "AI manager" : "No AI provider");
  const suggestedQuestions = $derived(buildSuggestedQuestions(draftState, recommendation, hasImportedRankings, showPlaceholderWarning));
  const contextSummary = $derived(buildAiPanelContextSummary(draftState, recommendation, hasImportedRankings, hasSeasonProjections, hasImportedAdp, showPlaceholderWarning));
  const boardChanged = $derived(
    Boolean(messages.length > 0 && conversationPick !== null && draftState && conversationPick !== draftState.currentPick),
  );

  function createMessage(role: AiMessage["role"], content: string, status: AiMessage["status"] = "complete"): AiMessage {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      content,
      status,
    };
  }

  async function submit(overrideQuestion?: string) {
    const trimmed = (overrideQuestion ?? question).trim();
    if (!trimmed || isAsking || !providerReady) {
      return;
    }

    isAsking = true;
    lastQuestion = trimmed;
    question = "";
    conversationPick = draftState?.currentPick ?? null;

    const conversationHistory = toConversationHistory(messages);
    const loadingMessage = createMessage("assistant", "Thinking through your draft context...", "loading");
    messages = [...messages, createMessage("user", trimmed), loadingMessage];

    try {
      const answer = await onAsk(trimmed, conversationHistory);
      messages = messages.map((message) =>
        message.id === loadingMessage.id ? { ...message, content: answer, status: "complete" } : message,
      );
    } catch (error) {
      const answer = error instanceof Error ? error.message : "The manager could not answer because the draft state is unavailable.";
      messages = messages.map((message) =>
        message.id === loadingMessage.id ? { ...message, content: answer, status: "error" } : message,
      );
    } finally {
      isAsking = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  function chooseSuggestion(nextQuestion: string) {
    submit(nextQuestion);
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      window.setTimeout(() => {
        copied = false;
      }, 1400);
    } catch {
      copied = false;
    }
  }

  function toConversationHistory(source: AiMessage[]): AiConversationMessage[] {
    return source
      .filter((message) => message.status !== "loading" && message.content.trim())
      .map((message) => ({ role: message.role, content: message.content.trim() }))
      .slice(-8);
  }

  function clearConversation() {
    messages = [];
    question = "";
    lastQuestion = "";
    conversationPick = null;
  }

  $effect(() => {
    const draftId = draftState?.id ?? "";
    if (conversationDraftId && draftId !== conversationDraftId) {
      clearConversation();
    }
    conversationDraftId = draftId;
  });

  $effect(() => {
    const request = promptRequest;
    if (!request || request.id === handledPromptRequestId) {
      return;
    }

    handledPromptRequestId = request.id;
    expanded = true;
    question = request.question;
    void tick().then(() => {
      panelElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (providerReady) {
        void submit(request.question);
      }
    });
  });
</script>

<article class="panel ask-panel" bind:this={panelElement}>
  <button class="ask-toggle" type="button" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
    <div class="ask-heading">
      <Icon name="message" size={17} />
      <div>
        <h2>Ask about this draft</h2>
        <span>Challenge the plan, compare players, or explore what-ifs</span>
      </div>
    </div>
    <div class="ask-status">
      <span class:offline={!providerReady} class="pill pill-info">{providerLabel}</span>
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
      <div class="context-strip" aria-label="AI context">
        <span class="context-label">AI context</span>
        <div class="context-chips">
          {#each contextSummary.chips as chip}
            <span>{chip}</span>
          {/each}
        </div>
      </div>

      {#if showPlaceholderWarning}
        <p class="callout callout-warning compact-callout">
          Player values are using Sleeper search ranks until rankings are imported.
        </p>
      {:else if contextSummary.note}
        <p class="context-note">{contextSummary.note}</p>
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

      {#if messages.length === 0}
        <SuggestedQuestions questions={suggestedQuestions} disabled={isAsking} onChoose={chooseSuggestion} />
      {:else}
        <div class="conversation" aria-live="polite">
          {#each messages as message (message.id)}
            <AiMessageBubble message={message} onCopy={copyMessage} onRetry={() => submit(lastQuestion)} />
          {/each}
        </div>
        {#if copied}
          <p class="copy-note">Copied response.</p>
        {/if}
        <SuggestedQuestions questions={suggestedQuestions.slice(0, 3)} disabled={isAsking} onChoose={chooseSuggestion} />
      {/if}

      <textarea
        class="input"
        bind:value={question}
        onkeydown={handleKeydown}
        rows="3"
        placeholder="Ask who to draft, compare players, or test a what-if."
      ></textarea>
      <button class="btn btn-primary btn-block" type="button" disabled={isAsking || !question.trim()} onclick={() => submit()}>
        {#if isAsking}<span class="spinner"></span>{/if}
        {isAsking ? "Asking" : "Ask AI"}
      </button>
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
    gap: 10px;
    border-top: 1px solid var(--border);
    padding: var(--space-4) var(--space-5) var(--space-5);
  }

  .ask-content textarea {
    min-height: 82px;
  }

  .provider-empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
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
    margin: 0;
    font-size: var(--text-xs);
  }

  .context-strip {
    display: grid;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    padding: 9px 10px;
  }

  .context-label {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .context-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .context-chips span {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 800;
    padding: 4px 7px;
  }

  .context-note,
  .copy-note {
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
    max-height: 420px;
    overflow: auto;
    padding-right: 3px;
  }

  .offline {
    border-color: var(--danger-border);
    background: var(--danger-soft);
    color: var(--danger);
  }

  @media (max-width: 560px) {
    .ask-toggle {
      align-items: flex-start;
      padding: var(--space-4);
    }

    .ask-status .pill {
      display: none;
    }

    .ask-content {
      padding: var(--space-4);
    }

    .board-change-note {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>

