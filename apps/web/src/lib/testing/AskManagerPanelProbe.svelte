<script lang="ts">
  import type { AiConversationMessage, DraftAskResult, DraftRecommendation } from "../types";

  let {
    recommendation = null,
    draftIdentity = "",
    onAsk,
  }: {
    recommendation?: DraftRecommendation | null;
    draftIdentity?: string;
    onAsk?: (question: string, conversationHistory: AiConversationMessage[]) => Promise<DraftAskResult>;
  } = $props();

  let isAsking = $state(false);
  let lastAnswer = $state("");
  let lastError = $state("");
  let askRequestSequence = 0;
  let activeAskRequestId = 0;
  let conversationDraftIdentity = $state("");

  function currentDraftIdentity(): string {
    return draftIdentity;
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
    const nextDraftIdentity = currentDraftIdentity();
    if (conversationDraftIdentity && nextDraftIdentity !== conversationDraftIdentity) {
      askRequestSequence += 1;
      activeAskRequestId = 0;
      isAsking = false;
      lastAnswer = "";
      lastError = "";
    }
    conversationDraftIdentity = nextDraftIdentity;
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
