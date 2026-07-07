<script lang="ts">
  import type { AiConversationMessage, AiProviderStatus, DraftRecommendation, DraftState, Position } from "../types";
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

  function buildSuggestedQuestions(
    state: DraftState | null,
    currentRecommendation: DraftRecommendation | null,
    rankingsImported: boolean,
    usingPlaceholderRanks: boolean,
  ): string[] {
    const fallback = [
      "Who should I draft if I pick right now?",
      "Compare my top 3 options.",
      "Should I prioritize QB here?",
      "What roster need matters most?",
    ];

    if (!state || !currentRecommendation?.candidates.length) {
      return fallback;
    }

    const candidates = currentRecommendation.candidates;
    const top = candidates[0];
    const second = candidates[1];
    const third = candidates[2];
    const rosterNeeds = getRosterNeeds(state);
    const questions: string[] = [];

    if (top) {
      questions.push(`Why is ${top.player.name} the recommendation?`);
    }

    if (top && second) {
      questions.push(`Compare ${top.player.name} vs ${second.player.name}.`);
    }

    if (top?.player.position === "QB" && hasSingleQbFormat(state)) {
      questions.push(`Should I take ${top.player.name} this early in a 1QB format?`);
    } else if (rosterNeeds.length > 0) {
      questions.push(`Should I prioritize ${formatPositionList(rosterNeeds)} over ${top?.player.position ?? "the top player"}?`);
    }

    const highReturn = candidates.find((candidate) => candidate.returnProbability >= 0.45 && candidate.player.name !== top?.player.name);
    if (highReturn) {
      questions.push(`Can I wait on ${highReturn.player.name}?`);
    } else if (third) {
      questions.push(`What changes if I pass on ${top?.player.name} for ${third.player.name}?`);
    }

    if (usingPlaceholderRanks) {
      questions.push("How much should I trust these placeholder Sleeper ranks?");
    } else if (rankingsImported) {
      questions.push("Where are imported rankings weakest for this decision?");
    }

    if (rosterNeeds.length > 0) {
      questions.push("What roster need matters most after this pick?");
    } else {
      questions.push("What position should I target next round?");
    }

    return uniqueQuestions(questions).slice(0, 6);
  }

  function getRosterNeeds(state: DraftState): Position[] {
    const userTeam = state.teams.find((team) => team.id === state.userTeamId);
    const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    const playersById = new Map(state.players.map((player) => [player.id, player]));

    for (const playerId of userTeam?.roster ?? []) {
      const player = playersById.get(playerId);
      if (player) {
        counts[player.position] += 1;
      }
    }

    return (["QB", "RB", "WR", "TE"] as Position[]).filter((position) => counts[position] < (state.settings.rosterSlots[position] ?? 0));
  }

  function hasSingleQbFormat(state: DraftState): boolean {
    return (state.settings.rosterSlots.QB ?? 0) <= 1 && (state.settings.rosterSlots.SUPER_FLEX ?? 0) === 0;
  }

  function formatPositionList(positions: Position[]): string {
    if (positions.length === 0) {
      return "roster need";
    }
    if (positions.length === 1) {
      return positions[0];
    }
    return `${positions.slice(0, -1).join("/")}/${positions[positions.length - 1]}`;
  }

  function uniqueQuestions(source: string[]): string[] {
    return Array.from(new Set(source.filter(Boolean)));
  }
</script>

<article class="panel ask-panel">
  <div class="panel-heading compact">
    <div>
      <p class="eyebrow">Ask the manager</p>
      <h2><Icon name="message" size={17} /> AI draft manager</h2>
    </div>
    <span class:offline={!providerReady} class="pill pill-info">{providerLabel}</span>
  </div>

  {#if showPlaceholderWarning}
    <p class="callout callout-warning compact-callout">
      Player values are using Sleeper search ranks until rankings are imported.
    </p>
  {:else if hasImportedRankings}
    <p class="context-note">Using Sleeper draft context and imported rankings. Imported rankings are not live projections.</p>
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
