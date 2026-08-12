<script lang="ts">
  import type { AiConversationMessage, DraftAskResult, DraftRecommendation } from "../types";

  let {
    recommendation = null,
    onAsk,
  }: {
    recommendation?: DraftRecommendation | null;
    onAsk?: (question: string, conversationHistory: AiConversationMessage[]) => Promise<DraftAskResult>;
  } = $props();

  let isAsking = $state(false);
  let lastAnswer = $state("");
  let lastError = $state("");

  async function askQuestion() {
    if (!onAsk || isAsking) {
      return;
    }

    isAsking = true;
    lastError = "";

    try {
      const result = await onAsk("Who should I draft next?", []);
      lastAnswer = result.answer;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Ask failed";
    } finally {
      isAsking = false;
    }
  }
</script>

<section aria-label="Ask manager probe">
  <button type="button" onclick={askQuestion}>{isAsking ? "Asking AI" : "Ask AI"}</button>
  <output data-testid="ask-manager-recommendation">
    {recommendation?.headline ?? "No recommendation"}
  </output>
  <output data-testid="ask-manager-answer">{lastAnswer}</output>
  <output data-testid="ask-manager-error">{lastError}</output>
</section>
