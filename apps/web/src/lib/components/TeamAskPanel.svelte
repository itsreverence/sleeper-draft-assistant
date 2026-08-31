<script lang="ts">
  import type { SuggestedQuestion } from "../ai-panel";
  import { createAiConversation } from "../ai-conversation.svelte";
  import { aiProviderAvailability, isAiProviderAvailable } from "../types";
  import type { AiConversationMessage, AiProviderStatus, TeamActivitySummary, TeamManagerState, TeamWeekContext } from "../types";
  import AiMessageBubble from "./AiMessageBubble.svelte";
  import SuggestedQuestions from "./SuggestedQuestions.svelte";

  let {
    teamState,
    weekContext = null,
    activitySummary = null,
    onAsk,
    providerStatus = null,
    promptRequest = null,
    onPromptRequestHandled,
    onOpenSettings,
    onRetryProvider,
  }: {
    teamState: TeamManagerState | null;
    weekContext?: TeamWeekContext | null;
    activitySummary?: TeamActivitySummary | null;
    onAsk: (question: string, conversationHistory: AiConversationMessage[]) => Promise<string>;
    providerStatus?: AiProviderStatus | null;
    promptRequest?: { id: number; question: string } | null;
    onPromptRequestHandled?: (requestId: number) => void;
    onOpenSettings?: () => void;
    onRetryProvider?: () => void | Promise<void>;
  } = $props();

  let handledPromptRequestId = 0;

  const providerReady = $derived(providerStatus?.id === "codex-app-server" && isAiProviderAvailable(providerStatus));
  const providerDisabled = $derived(aiProviderAvailability(providerStatus) === "disabled");
  const providerLabel = $derived(providerReady
    ? providerStatus?.label ?? "Codex"
    : providerDisabled ? "Codex disabled" : "Codex needs attention");
  const suggestions = $derived(buildTeamQuestions(teamState, weekContext, activitySummary));
  const openStarterSlots = $derived(teamState?.roster.starters.filter((slot) => !slot.player).length ?? 0);
  const firstOpenStarterSlot = $derived(teamState?.roster.starters.find((slot) => !slot.player)?.slot ?? null);
  const decisionPrompts = $derived.by(() => [
    firstOpenStarterSlot
      ? {
          category: "Lineup",
          title: `Fill ${firstOpenStarterSlot}`,
          prompt: `How should I fill my open ${firstOpenStarterSlot} slot?`,
        }
      : teamState?.seasonPhase === "regular"
        ? {
            category: "Lineup",
            title: "Choose starters",
            prompt: "Who should I start this week?",
          }
        : {
            category: "Depth",
            title: "Review weak spots",
            prompt: "Where is my roster or bench too thin?",
          },
    {
      category: "Waivers",
      title: "Find an upgrade",
      prompt: "Which available players improve my roster, and who could I drop?",
    },
    {
      category: "Strategy",
      title: "Review the plan",
      prompt: "What are the three highest-priority improvements for this roster?",
    },
  ]);
  const hasWeeklyProjections = $derived(Boolean(
    teamState?.roster.starters.some((slot) => slot.player?.projectionSource === "weekly_projection")
      || teamState?.roster.bench.some((player) => player.projectionSource === "weekly_projection"),
  ));
  const contextSummary = $derived(teamState ? [
    teamState.league.scoring,
    openStarterSlots ? `${openStarterSlots} open slot${openStarterSlots === 1 ? "" : "s"}` : `${teamState.roster.bench.length} bench`,
    weekContext
      ? `vs ${weekContext.opponentTeamName ?? "opponent"}`
      : teamState.seasonPhase === "preseason"
        ? "preseason"
        : teamState.week
          ? `week ${teamState.week}`
          : "week unknown",
    hasWeeklyProjections ? "weekly data ready" : "weekly data limited",
  ] : ["No team loaded"]);
  const conversationIdentity = $derived(teamState
    ? `${teamState.league.id}:${teamState.userTeam.rosterId}`
    : "no-team");
  const conversation = createAiConversation({
    ask: async (nextQuestion, history) => ({ answer: await onAsk(nextQuestion, history) }),
    loadingMessage: "Reviewing your roster and current evidence...",
    fallbackError: "Codex could not answer because team context is unavailable.",
  });

  $effect(() => conversation.syncIdentity(conversationIdentity));

  $effect(() => {
    const request = promptRequest;
    if (!request || request.id === handledPromptRequestId) return;
    handledPromptRequestId = request.id;
    onPromptRequestHandled?.(request.id);
    conversation.question = request.question;
    if (teamState && providerReady) void conversation.submit(request.question);
  });

  function submit(overrideQuestion?: string) {
    if (!teamState || !providerReady) return;
    void conversation.submit(overrideQuestion);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  function buildTeamQuestions(
    currentState: TeamManagerState | null,
    currentWeek: TeamWeekContext | null | undefined,
    currentActivity: TeamActivitySummary | null | undefined,
  ): SuggestedQuestion[] {
    if (!currentState) return [{ label: "After roster load", prompt: "What should I check after loading my roster?" }];

    const questions: SuggestedQuestion[] = [
      { label: "Roster plan", prompt: "What are the three highest-priority improvements for this roster?" },
      { label: "Add/drop", prompt: "Which available players improve my roster, and who could I drop?" },
      { label: "Bench depth", prompt: "Where is my bench too thin?" },
    ];
    const openSlot = currentState.roster.starters.find((slot) => !slot.player)?.slot;
    if (openSlot) questions.unshift({ label: `Fill ${openSlot}`, prompt: `How should I fill my open ${openSlot} slot?` });
    if (currentState.seasonPhase === "regular") questions.unshift({ label: "Lineup", prompt: "Who should I start this week?" });
    if (currentWeek) questions.unshift({ label: "Matchup", prompt: "What does this week's matchup change about my decisions?" });
    if (currentActivity?.trendingAdds.length) questions.push({ label: "Trending", prompt: "Which trending players should I investigate?" });
    return questions.filter((item, index) => questions.findIndex((candidate) => candidate.prompt === item.prompt) === index).slice(0, 5);
  }
</script>

<article class:has-conversation={conversation.messages.length > 0} class="panel team-ask-panel">
  <header class="assistant-header">
    <div>
      <div class="assistant-title">
        <h2>Ask Codex</h2>
        <span
          class:offline={!providerReady}
          class="provider-state"
          title={providerLabel}
          aria-label={providerReady ? `${providerLabel} ready` : providerLabel}
        ><i></i>{#if !providerReady}<span>{providerDisabled ? "Disabled" : "Needs attention"}</span>{/if}</span>
      </div>
      <p class="context-line">{conversation.messages.length > 0 ? contextSummary.join(" · ") : "Choose a prompt or ask your own."}</p>
    </div>
  </header>

  {#if !providerReady}
    <div class="provider-recovery" role="status">
      <div>
        <strong>{providerDisabled ? "Codex is disabled" : "Codex could not start"}</strong>
        <span>{providerStatus?.detail ?? "Verify the Codex CLI and login, then retry."}</span>
      </div>
      <div class="provider-actions">
        {#if onRetryProvider && !providerDisabled}<button class="btn btn-secondary" type="button" onclick={onRetryProvider}>Retry</button>{/if}
        {#if onOpenSettings}<button class="btn btn-primary" type="button" onclick={onOpenSettings}>Open settings</button>{/if}
      </div>
    </div>
  {:else if conversation.messages.length === 0}
    <div class="decision-grid" aria-label="Ask Codex starters">
      {#each decisionPrompts as prompt (prompt.prompt)}
        <button
          class="decision-prompt"
          type="button"
          aria-label={prompt.prompt}
          title={prompt.prompt}
          disabled={conversation.isAsking || !teamState || !providerReady}
          onclick={() => submit(prompt.prompt)}
        >
          <span>{prompt.category}</span>
          <strong>{prompt.title}</strong>
          <b aria-hidden="true">→</b>
        </button>
      {/each}
    </div>
  {:else}
    <div class="conversation" aria-live="polite">
      {#each conversation.messages as message (message.id)}
        <AiMessageBubble message={message} onCopy={conversation.copy} onRetry={() => submit(conversation.lastQuestion)} />
      {/each}
    </div>
    {#if conversation.copied}<p class="copy-note">Copied response.</p>{/if}
    <SuggestedQuestions questions={suggestions.slice(0, 3)} disabled={conversation.isAsking || !teamState || !providerReady} onChoose={submit} />
  {/if}

  {#if providerReady}<div class="composer">
    <textarea
      class="input"
      aria-label="Ask Codex about your team"
      bind:value={conversation.question}
      onkeydown={handleKeydown}
      rows={conversation.messages.length > 0 ? 3 : 1}
      placeholder={conversation.messages.length > 0 ? "Ask a follow-up…" : "Ask something else…"}
      disabled={!teamState || !providerReady}
    ></textarea>
    <button class="btn btn-primary" type="button" aria-label="Ask Codex" disabled={conversation.isAsking || !conversation.question.trim() || !teamState || !providerReady} onclick={() => submit()}>
      {#if conversation.isAsking}<span class="spinner"></span>{/if}
      {conversation.isAsking ? "Reviewing" : conversation.messages.length > 0 ? "Ask Codex" : "Ask"}
    </button>
  </div>{/if}
</article>

<style>
  .team-ask-panel { display: grid; grid-template-columns: minmax(190px, 230px) minmax(320px, 1fr); gap: 8px 18px; align-items: center; padding: 14px 16px; }
  .team-ask-panel.has-conversation { grid-template-columns: minmax(0, 1fr); align-items: stretch; gap: var(--space-3); padding: var(--space-5); }
  .assistant-header { grid-column: 1; grid-row: 1 / 3; align-self: center; }
  .has-conversation .assistant-header { grid-row: auto; }
  .assistant-title { display: flex; align-items: center; gap: 9px; }
  .assistant-header h2 { font-size: var(--text-lg); line-height: 1.2; }
  .context-line, .copy-note { margin: 5px 0 0; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.45; }
  .provider-state { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; color: var(--text-secondary); font-size: var(--text-2xs); font-weight: 800; }
  .provider-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .provider-state.offline { color: var(--danger); }
  .provider-state.offline i { background: var(--danger); }
  .provider-recovery { display: flex; grid-column: 2; align-items: center; justify-content: space-between; gap: var(--space-4); border: 1px solid var(--warning-border); border-radius: var(--radius-md); background: var(--warning-soft); padding: 10px 12px; }
  .provider-recovery > div:first-child { display: grid; gap: 3px; }
  .provider-recovery strong { font-size: var(--text-sm); }
  .provider-recovery span { color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.4; }
  .provider-actions { display: flex; flex: 0 0 auto; gap: 7px; }
  .decision-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-column: 2; gap: 7px; }
  .decision-prompt { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 10px; background: var(--surface-sunken); color: var(--text-primary); cursor: pointer; text-align: left; transition: border-color var(--transition-fast), background var(--transition-fast); }
  .decision-prompt:hover:not(:disabled) { border-color: var(--accent-border); background: var(--accent-soft); }
  .decision-prompt:disabled { cursor: not-allowed; opacity: .55; }
  .decision-prompt span { grid-column: 1; overflow: hidden; color: var(--text-muted); font-size: var(--text-2xs); font-weight: 850; letter-spacing: .04em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .decision-prompt strong { grid-column: 1; overflow: hidden; font-size: var(--text-xs); line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .decision-prompt b { grid-column: 2; grid-row: 1 / 3; align-self: center; color: var(--accent); font-size: var(--text-base); }
  .conversation { display: grid; gap: 10px; max-height: 440px; overflow: auto; padding-right: 3px; }
  .composer { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-column: 2; align-items: end; gap: 8px; }
  .has-conversation .composer { grid-column: 1; }
  .composer textarea { min-height: 40px; resize: none; }
  .has-conversation .composer textarea { min-height: 76px; resize: vertical; }
  .composer .btn { min-height: 40px; padding-inline: 16px; }
  @media (max-width: 900px) {
    .team-ask-panel { grid-template-columns: 1fr; }
    .assistant-header { grid-column: 1; grid-row: auto; }
    .decision-grid, .composer { grid-column: 1; }
    .provider-recovery { grid-column: 1; }
  }
  @media (max-width: 620px) {
    .composer { grid-template-columns: 1fr; }
    .decision-grid { grid-template-columns: 1fr; }
    .composer .btn { width: 100%; }
    .provider-recovery { align-items: stretch; flex-direction: column; }
    .provider-actions .btn { flex: 1; }
  }
</style>
