<script lang="ts">
  import type { SuggestedQuestion } from "../ai-panel";
  import { isAiProviderAvailable } from "../types";
  import type { AiConversationMessage, AiProviderStatus, TeamActivitySummary, TeamManagerState, TeamWeekContext } from "../types";
  import AiMessageBubble, { type AiMessage } from "./AiMessageBubble.svelte";
  import Icon from "./Icon.svelte";
  import SuggestedQuestions from "./SuggestedQuestions.svelte";

  let {
    teamState,
    weekContext = null,
    activitySummary = null,
    onAsk,
    providerStatus = null,
  }: {
    teamState: TeamManagerState | null;
    weekContext?: TeamWeekContext | null;
    activitySummary?: TeamActivitySummary | null;
    onAsk: (question: string, conversationHistory: AiConversationMessage[]) => Promise<string>;
    providerStatus?: AiProviderStatus | null;
  } = $props();

  let question = $state("");
  let messages: AiMessage[] = $state([]);
  let isAsking = $state(false);
  let copied = $state(false);
  let lastQuestion = $state("");

  const providerReady = $derived(providerStatus?.id === "codex-app-server" && isAiProviderAvailable(providerStatus));
  const providerLabel = $derived(providerReady ? providerStatus?.label ?? "Codex" : "Codex unavailable");
  const suggestions = $derived(buildTeamQuestions(teamState, weekContext, activitySummary));
  const openStarterSlots = $derived(teamState?.roster.starters.filter((slot) => !slot.player).length ?? 0);
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

  function createMessage(role: AiMessage["role"], content: string, status: AiMessage["status"] = "complete"): AiMessage {
    return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content, status };
  }

  async function submit(overrideQuestion?: string) {
    const trimmed = (overrideQuestion ?? question).trim();
    if (!trimmed || isAsking || !teamState || !providerReady) return;

    isAsking = true;
    lastQuestion = trimmed;
    question = "";
    const conversationHistory = toConversationHistory(messages);
    const loadingMessage = createMessage("assistant", "Reviewing your roster and current evidence...", "loading");
    messages = [...messages, createMessage("user", trimmed), loadingMessage];

    try {
      const answer = await onAsk(trimmed, conversationHistory);
      messages = messages.map((message) => message.id === loadingMessage.id
        ? { ...message, content: answer, status: "complete" }
        : message);
    } catch (error) {
      const answer = error instanceof Error ? error.message : "Codex could not answer because team context is unavailable.";
      messages = messages.map((message) => message.id === loadingMessage.id
        ? { ...message, content: answer, status: "error" }
        : message);
    } finally {
      isAsking = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      window.setTimeout(() => (copied = false), 1400);
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
    if (currentState.seasonPhase === "regular") questions.unshift({ label: "Set lineup", prompt: "Who should I start this week?" });
    if (currentWeek) questions.unshift({ label: "Matchup", prompt: "What does this week's matchup change about my decisions?" });
    if (currentActivity?.trendingAdds.length) questions.push({ label: "Trending", prompt: "Which trending players should I investigate?" });
    return questions.filter((item, index) => questions.findIndex((candidate) => candidate.prompt === item.prompt) === index).slice(0, 5);
  }
</script>

<article class="panel team-ask-panel">
  <header class="assistant-header">
    <div>
      <p class="eyebrow">AI team manager</p>
      <h2><Icon name="message" size={17} /> Ask Codex</h2>
      <p class="context-line">{contextSummary.join(" · ")}</p>
    </div>
    <span class:offline={!providerReady} class="provider-state"><i></i>{providerLabel}</span>
  </header>

  {#if messages.length === 0}
    <p class="intro">Codex reasons from your live Sleeper roster and separate weekly, rest-of-season, matchup, and activity signals.</p>
    <SuggestedQuestions questions={suggestions} disabled={isAsking || !teamState || !providerReady} onChoose={(nextQuestion) => submit(nextQuestion)} />
  {:else}
    <div class="conversation" aria-live="polite">
      {#each messages as message (message.id)}
        <AiMessageBubble message={message} onCopy={copyMessage} onRetry={() => submit(lastQuestion)} />
      {/each}
    </div>
    {#if copied}<p class="copy-note">Copied response.</p>{/if}
    <SuggestedQuestions questions={suggestions.slice(0, 3)} disabled={isAsking || !teamState || !providerReady} onChoose={(nextQuestion) => submit(nextQuestion)} />
  {/if}

  <div class="composer">
    <textarea
      class="input"
      bind:value={question}
      onkeydown={handleKeydown}
      rows="3"
      placeholder="Ask about your lineup, waivers, trades, or roster plan."
      disabled={!teamState || !providerReady}
    ></textarea>
    <button class="btn btn-primary" type="button" disabled={isAsking || !question.trim() || !teamState || !providerReady} onclick={() => submit()}>
      {#if isAsking}<span class="spinner"></span>{/if}
      {isAsking ? "Reviewing" : "Ask Codex"}
    </button>
  </div>
</article>

<style>
  .team-ask-panel { display: grid; gap: var(--space-3); }
  .assistant-header { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
  .assistant-header h2 { display: flex; align-items: center; gap: 8px; margin-top: 3px; font-size: var(--text-xl); }
  .context-line, .intro, .copy-note { margin: 5px 0 0; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.45; }
  .provider-state { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; color: var(--text-secondary); font-size: var(--text-xs); font-weight: 800; }
  .provider-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .provider-state.offline { color: var(--danger); }
  .provider-state.offline i { background: var(--danger); }
  .conversation { display: grid; gap: 10px; max-height: 440px; overflow: auto; padding-right: 3px; }
  .composer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; }
  .composer textarea { min-height: 76px; resize: vertical; }
  .composer .btn { min-height: 42px; }
  @media (max-width: 620px) {
    .assistant-header, .composer { grid-template-columns: 1fr; }
    .assistant-header { display: grid; }
    .provider-state { justify-self: start; }
    .composer .btn { width: 100%; }
  }
</style>
