import type { AiAnswer, AiDraftStrategy, AiProvider, AiProviderStatus, DraftAiContext, TeamAiContext } from "./types";

export class NoopAiProvider implements AiProvider {
  status(): AiProviderStatus {
    return {
      id: "noop",
      label: "Deterministic fallback",
      configured: true,
      detail: "No external AI provider is configured.",
    };
  }

  async strategizeDraft(context: DraftAiContext): Promise<AiDraftStrategy> {
    const top = context.recommendation.candidates[0];
    if (!top) {
      throw new Error("No draft candidates are available.");
    }
    return {
      provider: this.status(),
      decision: {
        basedOnPick: context.draft.currentPick,
        recommendedPlayerId: top.playerId,
        alternativePlayerIds: context.recommendation.candidates.slice(1, 5).map((candidate) => candidate.playerId),
        verdict: "reasonable",
        confidence: context.recommendation.confidence,
        headline: `Fallback: ${top.name}`,
        summary: context.recommendation.summary,
        reasons: top.reasons.slice(0, 5),
        risks: context.recommendation.risks.slice(0, 4),
        nextPositionPriorities: context.rosterConstruction.primaryNeeds.slice(0, 3),
        strategyNote: "Connect an AI provider for a model-generated draft strategy.",
      },
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

  async answerTeamQuestion(context: TeamAiContext): Promise<AiAnswer> {
    const topSignal = context.teamBrief.depthSignals[0] ?? "No obvious roster-structure weakness is visible from Sleeper roster data alone.";

    return {
      provider: this.status(),
      answer: [
        "AI provider is not connected yet, so this answer is using the deterministic Sleeper team context.",
        `Question: ${context.question}`,
        `Team: ${context.teamBrief.teamName} (${context.teamBrief.leagueFormat})`,
        topSignal,
        context.teamBrief.lineupStatus,
      ].join("\n\n"),
    };
  }
}
