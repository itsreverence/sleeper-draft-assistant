import { buildDraftRecommendation, createMockDraftState } from "@sleeper-ai/engine";
import { describe, expect, it } from "vitest";

import { buildDraftAiContext } from "./context";
import { NoopAiProvider } from "./noop-provider";

describe("AI provider context", () => {
  it("builds a compact draft question packet from draft state and recommendation", () => {
    const state = createMockDraftState(3);
    const recommendation = buildDraftRecommendation(state);
    const context = buildDraftAiContext(state, recommendation, "Who should I draft?");

    expect(context.task).toBe("draft_question");
    expect(context.question).toBe("Who should I draft?");
    expect(context.draft.id).toBe(state.id);
    expect(context.userTeam?.id).toBe(state.userTeamId);
    expect(context.recentPicks).toHaveLength(3);
    expect(context.recommendation.candidates[0]?.name).toBe(recommendation.candidates[0]?.player.name);
  });

  it("answers through the deterministic fallback provider", async () => {
    const state = createMockDraftState(0);
    const recommendation = buildDraftRecommendation(state);
    const context = buildDraftAiContext(state, recommendation, "What is my best pick?");
    const provider = new NoopAiProvider();

    const answer = await provider.answerDraftQuestion(context);

    expect(answer.provider.id).toBe("noop");
    expect(answer.answer).toContain("AI provider is not connected yet");
    expect(answer.answer).toContain(recommendation.candidates[0]?.player.name);
  });
});
