import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import type { DraftState, Player, Position } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { buildDraftQuestionContext, buildDraftStrategyContext } from "./context";
import { NoopAiProvider } from "./noop-provider";

describe("AI provider context", () => {
  it("builds a neutral draft question packet from draft state", () => {
    const state = createMockDraftState(3);
    const focusPlayer = state.players.find((player) => !state.picks.some((pick) => pick.playerId === player.id));
    const context = buildDraftQuestionContext(
      state,
      "Who should I draft?",
      Array.from({ length: 10 }, (_, index) => ({ role: "user" as const, content: `Question ${index}` })),
      { pinned: [], faded: [], excluded: [] },
      undefined,
      focusPlayer ? [focusPlayer.id] : [],
    );

    expect(context.task).toBe("draft_question");
    expect(context.question).toBe("Who should I draft?");
    expect(context.draft.id).toBe(state.id);
    expect(context.roster.teamId).toBe(state.userTeamId);
    expect(context.board.recentPicks).toHaveLength(3);
    expect(context.conversationHistory).toHaveLength(8);
    expect(context.focusPlayers[0]?.playerId).toBe(focusPlayer?.id);
    expect(context.playerEvidence[0]).not.toHaveProperty("score");
    expect(context.playerEvidenceGroups.projectionLeaders.length).toBeGreaterThan(0);
    expect(context).not.toHaveProperty("recommendation");
    expect(context).not.toHaveProperty("draftBrief");
  });

  it("answers through the neutral fallback provider", async () => {
    const state = createMockDraftState(0);
    const context = buildDraftQuestionContext(state, "What is my best pick?");
    const provider = new NoopAiProvider();

    const answer = await provider.answerDraftQuestion(context);

    expect(answer.provider.id).toBe("noop");
    expect(answer.answer).toContain("AI provider is not connected");
    const projectionLeader = context.playerEvidence.find(
      (player) => player.playerId === context.playerEvidenceGroups.projectionLeaders[0],
    );
    expect(answer.answer).toContain(projectionLeader?.name);
  });
  it("builds a structured strategy packet with a broad grounded shortlist", async () => {
    const state = createEightTeamTwoFlexState();
    const context = buildDraftStrategyContext(state);
    const strategy = await new NoopAiProvider().strategizeDraft(context);

    expect(context.task).toBe("draft_strategy");
    expect(context.playerEvidence.length).toBeGreaterThan(0);
    expect(context.playerEvidence[0]).not.toHaveProperty("score");
    expect(context.playerEvidenceGroups.projectionLeaders.length).toBeGreaterThan(0);
    expect(context.roster.openDirectStarterSlots.K).toBe(0);
    expect(context.roster.openSuperFlexSlots).toBe(0);
    expect(strategy.decision.basedOnPick).toBe(state.currentPick);
    expect(strategy.decision.recommendedPlayerId).toBe(context.playerEvidenceGroups.projectionLeaders[0]);
    expect(strategy.decision.alternativePlayerIds.length).toBeGreaterThan(0);
  });
  it("reports raw open slots when one position has consumed direct and flex capacity", () => {
    const state = createEightTeamTwoFlexState();
    const receivers = Array.from({ length: 4 }, (_, index) =>
      contextPlayer(`context-rostered-wr-${index}`, `Rostered WR ${index}`, "SEA", "WR", 250, index + 1, 1),
    );
    state.players.push(...receivers);
    state.teams[0]!.roster = receivers.map((player) => player.id);

    const context = buildDraftQuestionContext(state, "Should I draft another WR?");

    expect(context.roster.openDirectStarterSlots.RB).toBe(2);
    expect(context.roster.openDirectStarterSlots.WR).toBe(0);
    expect(context.roster.openFlexSlots).toBe(0);
    expect(context.roster.positionCounts.WR).toBe(4);
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


