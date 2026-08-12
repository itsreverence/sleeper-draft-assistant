<script lang="ts">
  import type { AiConversationMessage, DraftAskResult, DraftRecommendation, DraftState } from "../types";

  let {
    recommendation = null,
    draftState = null,
    onAsk,
  }: {
    recommendation?: DraftRecommendation | null;
    draftState?: DraftState | null;
    onAsk?: (question: string, conversationHistory: AiConversationMessage[]) => Promise<DraftAskResult>;
  } = $props();

  let isAsking = $state(false);
  let lastAnswer = $state("");
  let lastError = $state("");
  let askRequestSequence = 0;
  let activeAskRequestId = 0;
  let conversationDraftId = $state("");

  function currentDraftIdentity(): string {
    return draftState?.id ?? "";
  }

  async function askQuestion() {
    if (!onAsk || isAsking) {
      return;
    }

    const requestDraftId = currentDraftIdentity();
    const requestId = ++askRequestSequence;
    activeAskRequestId = requestId;
    isAsking = true;
    lastError = "";

    try {
      const result = await onAsk("Who should I draft next?", []);
      if (requestId !== activeAskRequestId || requestDraftId !== currentDraftIdentity()) {
        return;
      }
      lastAnswer = result.answer;
    } catch (error) {
      if (requestId !== activeAskRequestId || requestDraftId !== currentDraftIdentity()) {
        return;
      }
      lastError = error instanceof Error ? error.message : "Ask failed";
    } finally {
      if (requestId === activeAskRequestId && requestDraftId === currentDraftIdentity()) {
        isAsking = false;
      }
    }
  }

  $effect(() => {
    const draftId = currentDraftIdentity();
    if (conversationDraftId && draftId !== conversationDraftId) {
      askRequestSequence += 1;
      activeAskRequestId = 0;
      isAsking = false;
      lastAnswer = "";
      lastError = "";
    }
    conversationDraftId = draftId;
  });
</script>

<section aria-label="Ask manager probe">
  <button type="button" onclick={askQuestion}>{isAsking ? "Asking AI" : "Ask AI"}</button>
  <output data-testid="ask-manager-recommendation">
    {recommendation?.headline ?? "No recommendation"}
  </output>
  <output data-testid="ask-manager-answer">{lastAnswer}</output>
  <output data-testid="ask-manager-error">{lastError}</output>
</section>
