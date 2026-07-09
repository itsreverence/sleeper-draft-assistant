<script lang="ts">
  import { buildAiPanelContextSummary, buildSuggestedQuestions } from "../ai-panel";
  import type { AiConversationMessage, AiProviderStatus, DraftRecommendation, DraftState } from "../types";
  import AiMessageBubble, { type AiMessage } from "./AiMessageBubble.svelte";
  import Icon from "./Icon.svelte";
  import SuggestedQuestions from "./SuggestedQuestions.svelte";

  let {
    onAsk,
    providerStatus = null,
    hasImportedRankings = false,
    showPlaceholderWarning = false,
    draftState = null,
    recommendation = null,
  }: {
    onAsk: (question: string, conversationHistory: AiConversationMessage[]) => Promise<string>;
    providerStatus?: AiProviderStatus | null;
    hasImportedRankings?: boolean;
    showPlaceholderWarning?: boolean;
    draftState?: DraftState | null;
    recommendation?: DraftRecommendation | null;
  } = $props();

  let question = $state("");
  let messages: AiMessage[] = $state([]);
  let isAsking = $state(false);
  let copied = $state(false);
  let lastQuestion = $state("");

  const providerLabel = $derived(providerStatus?.label ?? "AI manager");
  const providerReady = $derived(Boolean(providerStatus?.configured));
  const suggestedQuestions = $derived(buildSuggestedQuestions(draftState, recommendation, hasImportedRankings, showPlaceholderWarning));
  const contextSummary = $derived(buildAiPanelContextSummary(draftState, recommendation, hasImportedRankings, showPlaceholderWarning));

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
    if (!trimmed || isAsking) {
      return;
    }

    isAsking = true;
    lastQuestion = trimmed;
    question = "";

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

</script>

<article class="panel ask-panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="message" size={17} /> Ask draft manager</h2>
    </div>
    <span class:offline={!providerReady} class="pill pill-info">{providerLabel}</span>
  </div>

  <div class="context-strip" aria-label="AI grounding context">
    <span class="context-label">Grounded in</span>
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
    rows="4"
    placeholder="Ask who to draft, whether to chase TE, or what your roster needs."
  ></textarea>
  <button class="btn btn-primary btn-block" type="button" disabled={isAsking || !question.trim()} onclick={() => submit()}>
    {#if isAsking}<span class="spinner"></span>{/if}
    {isAsking ? "Asking" : "Ask manager"}
  </button>
</article>

<style>
  .ask-panel {
    display: grid;
    gap: 10px;
  }

  .ask-panel textarea {
    min-height: 96px;
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
</style>

