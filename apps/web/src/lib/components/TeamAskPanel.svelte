<script lang="ts">
  import type { AiConversationMessage, AiProviderStatus, TeamLineupSummary, TeamManagerState, TeamNeedsSummary, TeamWaiverSummary, TeamWeekContext } from "../types";
  import AiMessageBubble, { type AiMessage } from "./AiMessageBubble.svelte";
  import Icon from "./Icon.svelte";
  import SuggestedQuestions from "./SuggestedQuestions.svelte";

  let {
    teamState,
    teamNeeds,
    lineupSummary = null,
    weekContext = null,
    waiverSummary = null,
    onAsk,
    providerStatus = null,
  }: {
    teamState: TeamManagerState | null;
    teamNeeds?: TeamNeedsSummary | null;
    lineupSummary?: TeamLineupSummary | null;
    weekContext?: TeamWeekContext | null;
    waiverSummary?: TeamWaiverSummary | null;
    onAsk: (question: string, conversationHistory: AiConversationMessage[]) => Promise<string>;
    providerStatus?: AiProviderStatus | null;
  } = $props();

  let question = $state("");
  let messages: AiMessage[] = $state([]);
  let isAsking = $state(false);
  let copied = $state(false);
  let lastQuestion = $state("");

  const providerLabel = $derived(providerStatus?.label ?? "AI manager");
  const providerReady = $derived(Boolean(providerStatus?.configured));
  const suggestions = $derived(buildTeamQuestions(teamState, teamNeeds, lineupSummary, weekContext, waiverSummary));
  const contextChips = $derived(
    teamState
      ? [
          teamState.league.scoring,
          teamNeeds?.weakestPositions.length ? `Weak: ${teamNeeds.weakestPositions.join("/")}` : `${teamState.roster.starters.length} starters`,
          lineupSummary?.swapRecommendations.length ? `${lineupSummary.swapRecommendations.length} lineup swaps` : teamNeeds?.openStarterSlots.length ? `${teamNeeds.openStarterSlots.length} open slots` : `${teamState.roster.bench.length} bench`,
          weekContext ? `Vs ${weekContext.opponentTeamName ?? "opponent"}` : teamState.week ? `Week ${teamState.week}` : "Week unknown",
          waiverSummary?.candidates.length ? `${waiverSummary.candidates.length} waiver options` : "Waivers pending",
        ]
      : ["No team loaded"],
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
    if (!trimmed || isAsking || !teamState) {
      return;
    }

    isAsking = true;
    lastQuestion = trimmed;
    question = "";

    const conversationHistory = toConversationHistory(messages);
    const loadingMessage = createMessage("assistant", "Thinking through your team context...", "loading");
    messages = [...messages, createMessage("user", trimmed), loadingMessage];

    try {
      const answer = await onAsk(trimmed, conversationHistory);
      messages = messages.map((message) =>
        message.id === loadingMessage.id ? { ...message, content: answer, status: "complete" } : message,
      );
    } catch (error) {
      const answer = error instanceof Error ? error.message : "The manager could not answer because team context is unavailable.";
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

  function buildTeamQuestions(currentState: TeamManagerState | null, currentNeeds: TeamNeedsSummary | null | undefined, currentLineup: TeamLineupSummary | null | undefined, currentWeek: TeamWeekContext | null | undefined, currentWaivers: TeamWaiverSummary | null | undefined): string[] {
    if (!currentState) {
      return ["What should I check after loading my roster?"];
    }

    const openSlot = currentNeeds?.openStarterSlots[0] ?? currentState.roster.starters.find((slot) => !slot.player)?.slot;
    const questions = [
      "What is my weakest position?",
      "Who are my likely starters?",
      "Where is my bench too thin?",
      "What should I prioritize after the draft?",
    ];

    if (openSlot) {
      questions.unshift(`How should I fill my open ${openSlot} slot?`);
    }

    if (currentNeeds?.weakestPositions.length) {
      questions.unshift(`How should I fix ${currentNeeds.weakestPositions.join("/")} first?`);
    }

    if (currentLineup) {
      questions.unshift("Who should I start this week?");
      if (currentLineup.swapRecommendations[0]?.recommendedPlayer && currentLineup.swapRecommendations[0]?.currentPlayer) {
        questions.unshift(`Should I start ${currentLineup.swapRecommendations[0].recommendedPlayer.name} over ${currentLineup.swapRecommendations[0].currentPlayer.name}?`);
      }
    }

    if (currentWeek) {
      questions.unshift("What does this week's matchup tell me?");
      if (currentWeek.userPoints !== null || currentWeek.opponentPoints !== null) {
        questions.unshift("Am I ahead in this matchup?");
      }
    }

    if (currentWaivers?.candidates.length) {
      questions.unshift("Who should I add or drop?");
      questions.unshift(`Is ${currentWaivers.candidates[0].player.name} worth adding?`);
    }

    return Array.from(new Set(questions)).slice(0, 5);
  }
</script>

<article class="panel team-ask-panel">
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">Ask about your team</p>
      <h2><Icon name="message" size={17} /> AI team manager</h2>
    </div>
    <span class:offline={!providerReady} class="pill pill-info">{providerLabel}</span>
  </div>

  <div class="context-strip" aria-label="AI team grounding context">
    <span class="context-label">Grounded in</span>
    <div class="context-chips">
      {#each contextChips as chip}
        <span>{chip}</span>
      {/each}
    </div>
  </div>

  <p class="context-note">Team answers use Sleeper roster structure, inferred waiver availability, and current weekly matchup state when available. Matchup scores and imported ranks are not projections.</p>

  {#if messages.length === 0}
    <SuggestedQuestions questions={suggestions} disabled={isAsking || !teamState} onChoose={(nextQuestion) => submit(nextQuestion)} />
  {:else}
    <div class="conversation" aria-live="polite">
      {#each messages as message (message.id)}
        <AiMessageBubble message={message} onCopy={copyMessage} onRetry={() => submit(lastQuestion)} />
      {/each}
    </div>
    {#if copied}
      <p class="copy-note">Copied response.</p>
    {/if}
    <SuggestedQuestions questions={suggestions.slice(0, 3)} disabled={isAsking || !teamState} onChoose={(nextQuestion) => submit(nextQuestion)} />
  {/if}

  <textarea
    class="input"
    bind:value={question}
    onkeydown={handleKeydown}
    rows="4"
    placeholder="Ask about starters, weak spots, bench depth, or post-draft priorities."
    disabled={!teamState}
  ></textarea>
  <button class="btn btn-primary btn-block" type="button" disabled={isAsking || !question.trim() || !teamState} onclick={() => submit()}>
    {#if isAsking}<span class="spinner"></span>{/if}
    {isAsking ? "Asking" : "Ask team manager"}
  </button>
</article>

<style>
  .team-ask-panel {
    display: grid;
    gap: 10px;
  }

  .team-ask-panel textarea {
    min-height: 96px;
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





