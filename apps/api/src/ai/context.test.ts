import { buildDraftRecommendation, createMockDraftState } from "@sleeper-draft-assistant/engine";
import type { DraftState, Player, Position } from "@sleeper-draft-assistant/shared";
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
    expect(context.draftBrief.engineLean).toContain(recommendation.candidates[0]?.player.name);
    expect(context.draftBrief.candidateTradeoffs[0]).toContain("Engine lean");
    expect(context.draftBrief.responseRules).toContain("Answer the user's exact question first, then explain the tradeoff.");
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
  it("includes roster pressure and candidate engine reasons for grounded answers", () => {
    const state = createEightTeamTwoFlexState();
    const recommendation = buildDraftRecommendation(state);
    const context = buildDraftAiContext(state, recommendation, "Should I pass on QB in this format?");
    const qb = context.recommendation.candidates.find((candidate) => candidate.playerId === "context-qb-allen");

    expect(context.rosterConstruction.flexSlots).toBe(2);
    expect(context.rosterConstruction.superFlexSlots).toBe(0);
    expect(context.rosterConstruction.rbWrDemand).toBe(6);
    expect(context.rosterConstruction.pressureSignals).toContain(
      "This format has 2 RB/WR/TE FLEX slot(s), increasing RB/WR depth pressure.",
    );
    expect(context.rosterConstruction.pressureSignals).toContain(
      "This is a shallow one-QB league, so QB replacement pressure is lower than in deeper or superflex formats.",
    );
    expect(context.recommendation.candidates[0]?.reasons).toContain("matches RB/WR flex demand");
    expect(qb?.reasons).toContain("shallow league reduces replacement pressure");
    expect(context.draftBrief.leagueFormat).toContain("8-team PPR");
    expect(context.draftBrief.primaryDecisionGuidance).toContain("RB/WR depth has extra importance because FLEX slots increase weekly starter demand.");
    expect(context.draftBrief.primaryDecisionGuidance).toContain("QB replacement pressure is lower because this is not a superflex format.");
    expect(context.draftBrief.rosterPressure).toContain("This format has 2 RB/WR/TE FLEX slot(s), increasing RB/WR depth pressure.");
  });
});
function createEightTeamTwoFlexState(): DraftState {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: `context-team-${index + 1}`,
    name: index === 0 ? "Your Team" : `Team ${index + 1}`,
    draftSlot: index + 1,
    roster: [],
  }));

  return {
    id: "context-format-test-draft",
    name: "8-Team PPR Two Flex",
    status: "pre_draft",
    currentPick: 1,
    userTeamId: "context-team-1",
    settings: {
      teams: 8,
      rounds: 15,
      scoring: "PPR",
      rosterSlots: {
        QB: 1,
        RB: 2,
        WR: 2,
        TE: 1,
        FLEX: 2,
        BN: 7,
      },
    },
    teams,
    players: [
      contextPlayer("context-qb-allen", "Josh Allen", "BUF", "QB", 385, 5, 1),
      contextPlayer("context-rb-gibbs", "Jahmyr Gibbs", "DET", "RB", 286, 2, 1),
      contextPlayer("context-wr-chase", "Ja'Marr Chase", "CIN", "WR", 298, 3, 1),
      contextPlayer("context-rb-bijan", "Bijan Robinson", "ATL", "RB", 282, 4, 1),
      contextPlayer("context-te-bowers", "Brock Bowers", "LV", "TE", 205, 18, 1),
      contextPlayer("context-qb-hurts", "Jalen Hurts", "PHI", "QB", 348, 20, 2),
    ],
    picks: [],
    updatedAt: new Date().toISOString(),
  };
}

function contextPlayer(
  id: string,
  name: string,
  team: string,
  position: Position,
  projectedPoints: number,
  adp: number,
  tier: number,
): Player {
  return {
    id,
    sleeperId: id,
    name,
    team,
    position,
    projectedPoints,
    projectionSource: "mock",
    adp,
    tier,
    riskTags: [],
  };
}


