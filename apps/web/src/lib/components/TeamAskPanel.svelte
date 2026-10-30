<script lang="ts">
  import { tick } from "svelte";
  import type { AiRequestProgress } from "../api";
  import { CANCEL_REQUEST_HELP, createAiConversation } from "../ai-conversation.svelte";
  import { errorCopy } from "../error-copy";
  import { followNewest } from "../thread-scroll";
  import { aiProviderAvailability, isAssistantReady } from "../types";
  import type { AiConversationMessage, AiProviderStatus, TeamManagerState, TeamWeekContext } from "../types";
  import AiMessageBubble from "./AiMessageBubble.svelte";
  import Icon from "./Icon.svelte";

  let {
    teamState,
    weekContext = null,
    selectedSeason = null,
    selectedWeek = null,
    contextKey = "",
    onAsk,
    providerStatus = null,
    promptRequest = null,
    onPromptRequestHandled,
    onOpenSettings,
    onRetryProvider,
  }: {
    teamState: TeamManagerState | null;
    weekContext?: TeamWeekContext | null;
    selectedSeason?: string | null;
    selectedWeek?: number | null;
    contextKey?: string;
    onAsk: (question: string, conversationHistory: AiConversationMessage[], progress?: AiRequestProgress) => Promise<string>;
    providerStatus?: AiProviderStatus | null;
    promptRequest?: { id: number; question: string } | null;
    onPromptRequestHandled?: (requestId: number) => void;
    onOpenSettings?: () => void;
    onRetryProvider?: () => void | Promise<void>;
  } = $props();

  // Puts a question in the composer for the reader to edit and send. Anything already typed stays.
  export async function composeQuestion(question: string) {
    const draft = conversation.question.trim();
    conversation.question = draft ? `${draft}\n${question}` : question;
    await tick();
    composerElement?.focus();
    composerElement?.setSelectionRange(conversation.question.length, conversation.question.length);
  }

  let handledPromptRequestId = 0;
  let panelElement = $state<HTMLElement>();
  let composerElement = $state<HTMLTextAreaElement>();
  let sendButton = $state<HTMLButtonElement>();
  let threadOpen = $state(true);

  $effect(() => {
    if (!conversation.isAsking && document.activeElement === sendButton) composerElement?.focus();
  });

  const providerReady = $derived(isAssistantReady(providerStatus));
  const providerDisabled = $derived(aiProviderAvailability(providerStatus) === "disabled");
  const quickQuestions = $derived.by(() => {
    const openSlot = teamState?.roster.starters.find((slot) => !slot.player)?.slot;
    return [
      openSlot
        ? { label: "Lineup", prompt: `How should I fill my open ${openSlot} slot?` }
        : teamState?.seasonPhase === "regular"
          ? { label: "Lineup", prompt: "Who should I start this week?" }
          : { label: "Depth", prompt: "Where is my roster or bench too thin?" },
      { label: "Waivers", prompt: "Which available players improve my roster, and who could I drop?" },
      { label: "Plan", prompt: "What are the three highest-priority improvements for this roster?" },
    ];
  });
  const conversationIdentity = $derived(teamState
    ? `${teamState.league.id}:${teamState.userTeam.rosterId}:${selectedSeason ?? teamState.league.season}:${selectedWeek ?? weekContext?.week ?? teamState.week}`
    : "no-team");
  const conversation = createAiConversation({
    ask: async (nextQuestion, history, progress) => ({ answer: await onAsk(nextQuestion, history, progress) }),
    fallbackError: errorCopy.teamAnswer,
  });

  const newest = $derived.by(() => {
    const last = conversation.messages.at(-1);
    return last ? { id: last.id, status: last.status } : null;
  });

  $effect(() => conversation.syncIdentity(`${conversationIdentity}:${contextKey}`));

  $effect(() => {
    const request = promptRequest;
    if (!request || request.id === handledPromptRequestId) return;
    handledPromptRequestId = request.id;
    onPromptRequestHandled?.(request.id);
    conversation.question = request.question;
    if (teamState && providerReady) submit(request.question);
  });

  // The open thread has a fixed height, so this one scroll keeps it and the composer in view and an arriving answer never moves the page.
  function submit(overrideQuestion?: string) {
    if (!teamState || !providerReady) return;
    threadOpen = true;
    void conversation.submit(overrideQuestion);
    void tick().then(() => panelElement?.scrollIntoView({ block: "nearest" }));
  }

  function choosePrompt(prompt: string) {
    submit(prompt);
    composerElement?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  }
</script>

<section class="team-assistant" class:thread-open={threadOpen && conversation.messages.length > 0} aria-label="Assistant" bind:this={panelElement}>
  {#if !providerReady}
    <div class="provider-recovery" role="status">
      <div>
        <strong>{providerDisabled ? "The Assistant is disabled" : "The Assistant could not start"}</strong>
        <span>{providerStatus?.detail ?? "Verify the Codex CLI and login, then retry."}</span>
      </div>
      <div class="provider-actions">
        {#if onRetryProvider && !providerDisabled}<button class="btn btn-secondary" type="button" onclick={onRetryProvider}>Retry</button>{/if}
        {#if onOpenSettings}<button class="btn btn-secondary" type="button" onclick={onOpenSettings}>Open settings</button>{/if}
      </div>
    </div>
  {:else}
    {#if threadOpen && conversation.messages.length > 0}
      <div class="conversation" role="log" aria-label="Team conversation" aria-live="polite" use:followNewest={newest}>
        {#each conversation.messages as message (message.id)}
          <AiMessageBubble message={message} answerNumber={conversation.answerNumber(message.id)} onCopy={conversation.copy} onRetry={() => submit(conversation.questionFor(message.id))} />
        {/each}
      </div>
      {#if conversation.copied}<p class="copy-note">Copied response.</p>{/if}
    {/if}
    <div class="command-bar">
      <div class="composer">
        <textarea
          bind:this={composerElement}
          aria-label="Ask Assistant about your team"
          bind:value={conversation.question}
          onkeydown={handleKeydown}
          rows="1"
          placeholder={conversation.messages.length > 0 ? "Ask a follow-up…" : "Ask about your team…"}
          disabled={!teamState}
        ></textarea>
        <button bind:this={sendButton} class="composer-send" class:composer-cancel={conversation.isAsking}
          class:idle={!conversation.isAsking && !conversation.question.trim()}
          type="button" aria-label={conversation.isAsking ? "Cancel" : "Ask Assistant"}
          title={conversation.isAsking ? CANCEL_REQUEST_HELP : undefined}
          disabled={!conversation.isAsking && (!conversation.question.trim() || !teamState)}
          onclick={() => conversation.isAsking ? conversation.cancel() : submit()}
        >{conversation.isAsking ? "Cancel" : "Ask"}</button>
        <div class="composer-actions">
          {#if conversation.messages.length > 0}
            <button class="quick" type="button" aria-expanded={threadOpen} onclick={() => (threadOpen = !threadOpen)}>
              Conversation<Icon name="chevron-right" size={12} />
            </button>
          {/if}
          <div class="quick-questions" role="group" aria-label="Quick questions">
            {#each quickQuestions as question (question.label)}
              <button class="quick" type="button" title={question.prompt} disabled={conversation.isAsking || !teamState} onclick={() => choosePrompt(question.prompt)}>{question.label}</button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  /* DOM order stays thread, composer so the composer never remounts and focus survives the thread opening. */
  .team-assistant { min-width: 0; }
  .thread-open { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; }
  .conversation { display: grid; gap: 10px; height: clamp(240px, 42vh, 460px); align-content: start; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: var(--space-4) var(--space-5); }
  .copy-note { padding: 0 var(--space-5) 10px; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.45; }
  .thread-open .command-bar { border-top: 1px solid var(--border); padding: var(--space-3); }

  .composer { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); min-width: 0; min-height: 44px; border: 1px solid var(--border-input); border-radius: var(--radius-md); background: var(--surface-sunken); padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3); }
  .composer:focus-within { border-color: var(--accent-border); box-shadow: 0 0 0 1px var(--accent-border); }
  textarea { flex: 1 1 200px; min-width: 0; max-height: 96px; border: 0; outline: 0; background: transparent; padding: var(--space-1) 0; color: var(--text-primary); field-sizing: content; font-size: var(--text-base); resize: none; }
  textarea::placeholder { color: var(--text-muted); }
  /* The composer around it draws the focus ring. */
  .composer textarea:focus-visible { outline: 0; box-shadow: none; }
  .composer-send { min-width: 52px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface-raised); padding: 6px 10px; color: var(--text-primary); cursor: pointer; font-size: var(--text-sm); font-weight: 600; }
  .composer-send.idle { display: none; }
  .composer-send:hover { background: var(--surface-hover); }
  .composer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); margin-left: auto; }
  .quick-questions { display: flex; align-items: center; gap: var(--space-1); }
  .quick { display: inline-flex; align-items: center; gap: 2px; min-height: 28px; border: 0; border-radius: var(--radius-sm); background: transparent; padding: 0 var(--space-2); color: var(--text-secondary); cursor: pointer; font-size: var(--text-sm); font-weight: 500; }
  .quick:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
  .quick:disabled { cursor: not-allowed; color: var(--text-muted); }
  .quick[aria-expanded="true"] > :global(.icon) { transform: rotate(90deg); }

  .provider-recovery { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); border: 1px solid var(--warning-border); border-radius: var(--radius-md); background: var(--warning-soft); padding: var(--space-3); }
  .provider-recovery > div:first-child { display: grid; gap: 2px; min-width: 0; }
  .provider-recovery strong { font-size: var(--text-md); font-weight: 600; }
  .provider-recovery span { color: var(--text-secondary); font-size: var(--text-sm); }
  .provider-actions { display: flex; flex: 0 0 auto; gap: var(--space-2); }
  .provider-actions .btn { min-height: 32px; padding: var(--space-1) var(--space-3); font-size: var(--text-sm); }

  @media (max-width: 520px) {
    .conversation { padding: var(--space-4); }
    .composer-actions { margin-left: 0; }
    .provider-recovery { align-items: stretch; flex-direction: column; }
    .provider-actions .btn { flex: 1; }
  }
</style>
