<script lang="ts">
  import type { SuggestedQuestion } from "../ai-panel";
  import type { AiConversationMessage, AiProviderStatus, TeamActivitySummary, TeamLineupSummary, TeamManagerState, TeamNeedsSummary, TeamWaiverSummary, TeamWeekContext } from "../types";
  import AiMessageBubble, { type AiMessage } from "./AiMessageBubble.svelte";
  import Icon from "./Icon.svelte";
  import SuggestedQuestions from "./SuggestedQuestions.svelte";

  let {
    teamState,
    teamNeeds,
    lineupSummary = null,
    weekContext = null,
    waiverSummary = null,
    activitySummary = null,
    onAsk,
    providerStatus = null,
  }: {
    teamState: TeamManagerState | null;
    teamNeeds?: TeamNeedsSummary | null;
    lineupSummary?: TeamLineupSummary | null;
    weekContext?: TeamWeekContext | null;
    waiverSummary?: TeamWaiverSummary | null;
    activitySummary?: TeamActivitySummary | null;
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
  const suggestions = $derived(buildTeamQuestions(teamState, teamNeeds, lineupSummary, weekContext, waiverSummary, activitySummary));
  const hasWeeklyProjections = $derived(
    Boolean(
      lineupSummary?.decisions.some((decision) => decision.recommendedPlayer?.projectionSource === "weekly_projection" || decision.currentPlayer?.projectionSource === "weekly_projection") ||
        waiverSummary?.candidates.some((candidate) => candidate.player.projectionSource === "weekly_projection") ||
        teamState?.roster.starters.some((slot) => slot.player?.projectionSource === "weekly_projection") ||
        teamState?.roster.bench.some((player) => player.projectionSource === "weekly_projection"),
    ),
  );
  const contextChips = $derived(
    teamState
      ? [
          teamState.league.scoring,
          teamNeeds?.weakestPositions.length ? `Weak: ${teamNeeds.weakestPositions.join("/")}` : `${teamState.roster.starters.length} starters`,
          lineupSummary?.swapRecommendations.length ? `${lineupSummary.swapRecommendations.length} lineup swaps` : teamNeeds?.openStarterSlots.length ? `${teamNeeds.openStarterSlots.length} open slots` : `${teamState.roster.bench.length} bench`,
          weekContext ? `Vs ${weekContext.opponentTeamName ?? "opponent"}` : teamState.week ? `Week ${teamState.week}` : "Week unknown",
          hasWeeklyProjections ? "Weekly projections" : "No weekly projections",
          waiverSummary?.candidates.length ? `${waiverSummary.candidates.length} waiver options` : "Waivers pending",
          activitySummary?.trendingAdds.length ? `${activitySummary.trendingAdds.length} trending adds` : "Activity pending",
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

  function buildTeamQuestions(currentState: TeamManagerState | null, currentNeeds: TeamNeedsSummary | null | undefined, currentLineup: TeamLineupSummary | null | undefined, currentWeek: TeamWeekContext | null | undefined, currentWaivers: TeamWaiverSummary | null | undefined, currentActivity: TeamActivitySummary | null | undefined): SuggestedQuestion[] {
    if (!currentState) {
      return [{ label: "After roster load", prompt: "What should I check after loading my roster?" }];
    }

    const openSlot = currentNeeds?.openStarterSlots[0] ?? currentState.roster.starters.find((slot) => !slot.player)?.slot;
    const questions: SuggestedQuestion[] = [
      { label: "Weakest position", prompt: "What is my weakest position?" },
      { label: "Likely starters", prompt: "Who are my likely starters?" },
      { label: "Bench depth", prompt: "Where is my bench too thin?" },
      { label: "Post-draft priorities", prompt: "What should I prioritize after the draft?" },
    ];

    if (openSlot) {
      questions.unshift({ label: `Fill ${openSlot}`, prompt: `How should I fill my open ${openSlot} slot?` });
    }

    if (currentNeeds?.weakestPositions.length) {
      const positions = currentNeeds.weakestPositions.join("/");
      questions.unshift({ label: `Fix ${positions}`, prompt: `How should I fix ${positions} first?` });
    }

    if (currentLineup) {
      questions.unshift({ label: "Set this week's lineup", prompt: "Who should I start this week?" });
      if (currentLineup.swapRecommendations[0]?.recommendedPlayer && currentLineup.swapRecommendations[0]?.currentPlayer) {
        const recommendedName = currentLineup.swapRecommendations[0].recommendedPlayer.name;
        const currentName = currentLineup.swapRecommendations[0].currentPlayer.name;
        questions.unshift({ label: `Start ${recommendedName}?`, prompt: `Should I start ${recommendedName} over ${currentName}?` });
      }
    }

    if (currentWeek) {
      questions.unshift({ label: "Matchup outlook", prompt: "What does this week's matchup tell me?" });
      if (currentWeek.userPoints !== null || currentWeek.opponentPoints !== null) {
        questions.unshift({ label: "Am I ahead?", prompt: "Am I ahead in this matchup?" });
      }
    }

    if (currentActivity?.trendingAdds.length) {
      const playerName = currentActivity.trendingAdds[0].player.name;
      questions.unshift({ label: "Trending adds", prompt: "Who is trending that I should care about?" });
      questions.unshift({ label: `${playerName} trending?`, prompt: `Should I care about ${playerName} trending up?` });
    }

    if (currentWaivers?.candidates.length) {
      const playerName = currentWaivers.candidates[0].player.name;
      questions.unshift({ label: "Add/drop advice", prompt: "Who should I add or drop?" });
      questions.unshift({ label: `Add ${playerName}?`, prompt: `Is ${playerName} worth adding?` });
    }

    return questions.filter((question, index) => questions.findIndex((candidate) => candidate.prompt === question.prompt) === index).slice(0, 5);
  }
</script>

<article class="panel team-ask-panel">
  <div class="panel-heading compact">
    <div>
      <h2><Icon name="message" size={17} /> Ask team manager</h2>
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

  <p class="context-note">
    {hasWeeklyProjections
      ? "Team answers use Sleeper roster structure, imported weekly projections, inferred waiver availability, Sleeper activity, and current weekly matchup state when available."
      : "Team answers use Sleeper roster structure, inferred waiver availability, Sleeper activity, and current weekly matchup state when available. Matchup scores and imported ranks are not projections."}
  </p>

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






