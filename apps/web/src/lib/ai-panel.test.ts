import { describe, expect, it } from "vitest";
import type { Player } from "@sleeper-draft-assistant/shared";
import type {
  AiProviderStatus,
  DraftRecommendation,
  DraftState,
  Position,
} from "./types";
import {
  buildAiPanelContextSummary,
  buildSuggestedQuestions,
  currentAiDraftStrategy,
  shouldRequestAiDraftStrategy,
} from "./ai-panel";

const state = createState();
const recommendation = createRecommendation();

describe("AI panel helpers", () => {
  it("suggests questions from engine reasons and data quality", () => {
    const questions = buildSuggestedQuestions(state, recommendation, true, false);

    expect(questions).toContain("Which RB/WR fits this build best?");
    expect(questions).toContain("Should I pass on QB in this format?");
    expect(questions).toContain("Where are imported rankings weakest for this decision?");
  });

  it("builds concise grounding chips for the AI panel", () => {
    const summary = buildAiPanelContextSummary(state, recommendation, true, false);

    expect(summary.chips).toContain("PPR");
    expect(summary.chips).toContain("2 FLEX");
    expect(summary.chips).toContain("Imported rankings");
    expect(summary.chips).toContain("RB/WR flex pressure");
    expect(summary.chips).toContain("Lower QB pressure");
    expect(summary.note).toContain("imported rankings");
  });

  it("requests AI-first strategy near the turn and rejects stale results", () => {
    const draftingState = { ...state, status: "drafting" as const };
    const providerStatus: AiProviderStatus = {
      id: "codex-app-server",
      configured: true,
      label: "Codex app server",
    };

    expect(shouldRequestAiDraftStrategy(draftingState, providerStatus, 2)).toBe(true);
    expect(shouldRequestAiDraftStrategy(draftingState, providerStatus, 3)).toBe(false);
    expect(shouldRequestAiDraftStrategy({ ...draftingState, status: "pre_draft" }, providerStatus, null)).toBe(true);
    expect(shouldRequestAiDraftStrategy({ ...draftingState, status: "complete" }, providerStatus, 0)).toBe(false);

    const strategy = {
      provider: providerStatus,
      pickNumber: 12,
      decision: {
        basedOnPick: 12,
        recommendedPlayerId: "rb-1",
        alternativePlayerIds: [],
        verdict: "strong" as const,
        confidence: "high" as const,
        headline: "Take Gibbs",
        summary: "Best fit.",
        reasons: ["Fills RB"],
        risks: [],
        nextPositionPriorities: ["WR" as const],
        strategyNote: "Target WR next.",
      },
      recommendedCandidate: recommendation.candidates[0]!,
      alternativeCandidates: [],
    };
    expect(currentAiDraftStrategy(strategy, 12)).toBe(strategy);
    expect(currentAiDraftStrategy(strategy, 13)).toBeNull();
  });
});

function createState(): DraftState {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: `team-${index + 1}`,
    name: index === 0 ? "Your Team" : `Team ${index + 1}`,
    draftSlot: index + 1,
    roster: [],
  }));

  return {
    id: "draft-1",
    name: "8-Team PPR",
    status: "pre_draft",
    currentPick: 1,
    userTeamId: "team-1",
    settings: {
      teams: 8,
      rounds: 15,
      scoring: "PPR",
      rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 7 },
    },
    teams,
    players: [
      player("rb-1", "Jahmyr Gibbs", "DET", "RB"),
      player("qb-1", "Josh Allen", "BUF", "QB"),
    ],
    picks: [],
    updatedAt: "2026-07-07T12:00:00.000Z",
  };
}

function createRecommendation(): DraftRecommendation {
  return {
    headline: "Lean Jahmyr Gibbs",
    recommendedPlayerId: "rb-1",
    confidence: "high",
    summary: "Jahmyr Gibbs fits the build.",
    risks: [],
    assumptions: ["Imported rankings are powering this recommendation."],
    candidates: [
      {
        player: player("rb-1", "Jahmyr Gibbs", "DET", "RB"),
        score: 98,
        projectedEdge: 106,
        rosterFit: "need",
        valueLabel: "rank 1",
        scarcityLabel: "stable supply",
        returnProbability: 0.12,
        reasons: ["FantasyPros rank 1", "fills a RB roster need", "matches RB/WR flex demand"],
      },
      {
        player: player("qb-1", "Josh Allen", "BUF", "QB"),
        score: 90,
        projectedEdge: 135,
        rosterFit: "need",
        valueLabel: "rank 5",
        scarcityLabel: "stable supply",
        returnProbability: 0.22,
        reasons: ["FantasyPros rank 5", "fills a QB roster need", "shallow league reduces replacement pressure"],
      },
    ],
  };
}

function player(id: string, name: string, team: string, position: Position): Player {
  return {
    id,
    sleeperId: id,
    name,
    team,
    position,
    projectedPoints: 250,
    projectionSource: "imported",
    adp: 1,
    tier: 1,
    riskTags: [],
    importedRank: 1,
  };
}

