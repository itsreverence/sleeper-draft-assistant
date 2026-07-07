import type { AiAnswer, AiProvider, AiProviderStatus, DraftAiContext } from "./types";

export class NoopAiProvider implements AiProvider {
  status(): AiProviderStatus {
    return {
      id: "noop",
      label: "Deterministic fallback",
      configured: true,
      detail: "No external AI provider is configured.",
    };
  }

  async answerDraftQuestion(context: DraftAiContext): Promise<AiAnswer> {
    const top = context.recommendation.candidates[0];
    const candidateText = top
      ? `${top.name} is currently the top deterministic candidate (${top.position}, score ${top.score}). ${top.reasons.join(" ")}`
      : "There are no available candidates in the current draft state.";

    return {
      provider: this.status(),
      answer: [
        "AI provider is not connected yet, so this answer is using the deterministic draft context.",
        `Question: ${context.question}`,
        candidateText,
        context.recommendation.summary,
      ].join("\n\n"),
    };
  }
}