import type { DraftState } from "@sleeper-ai/shared";
import { describe, expect, it } from "vitest";

import {
  advanceMockDraftState,
  buildCandidateSignals,
  buildDraftRecommendation,
  createMockDraftState,
  getAvailablePlayers,
} from "./index";

describe("mock draft engine", () => {
  it("removes drafted players from the available pool", () => {
    const state = createMockDraftState(5);
    const available = getAvailablePlayers(state);

    expect(available.some((player) => player.id === "p-jefferson")).toBe(false);
    expect(available.length).toBe(state.players.length - 5);
  });

  it("builds candidate signals sorted by score", () => {
    const state = createMockDraftState(12);
    const signals = buildCandidateSignals(state, 5);

    expect(signals).toHaveLength(5);
    expect(signals[0].score).toBeGreaterThanOrEqual(signals[1].score);
    expect(signals[0].reasons.length).toBeGreaterThan(0);
  });

  it("returns a structured recommendation", () => {
    const state = createMockDraftState(10);
    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.recommendedPlayerId).toBeTruthy();
    expect(recommendation.candidates.length).toBeGreaterThan(0);
    expect(recommendation.assumptions).toContain("Mock projections and ADP are demo data.");
  });

  it("excludes user-hidden players from recommendations", () => {
    const state = createMockDraftState(12);
    const baseline = buildDraftRecommendation(state);
    const excludedId = baseline.candidates[0]?.player.id;

    const recommendation = buildDraftRecommendation(state, {
      preferences: { excludedPlayerIds: excludedId ? [excludedId] : [] },
    });

    expect(recommendation.recommendedPlayerId).not.toBe(excludedId);
    expect(recommendation.candidates.some((candidate) => candidate.player.id === excludedId)).toBe(false);
    expect(recommendation.assumptions.some((assumption) => assumption.includes("Excluded players hidden"))).toBe(true);
  });

  it("boosts pinned players and annotates the reason", () => {
    const state = createMockDraftState(12);
    const baseline = buildDraftRecommendation(state);
    const target = baseline.candidates[2];

    const recommendation = buildDraftRecommendation(state, {
      preferences: { pinnedPlayerIds: target ? [target.player.id] : [] },
    });

    const boosted = recommendation.candidates.find((candidate) => candidate.player.id === target?.player.id);
    expect(boosted?.score).toBeGreaterThan(target?.score ?? 0);
    expect(boosted?.reasons).toContain("user pinned this player");
    expect(recommendation.assumptions.some((assumption) => assumption.includes("User pinned"))).toBe(true);
  });

  it("penalizes faded players and annotates the reason", () => {
    const state = createMockDraftState(12);
    const baseline = buildCandidateSignals(state, 20);
    const target = baseline[0];

    const fadedSignals = buildCandidateSignals(state, 20, {
      preferences: { fadedPlayerIds: target ? [target.player.id] : [] },
    });
    const recommendation = buildDraftRecommendation(state, {
      preferences: { fadedPlayerIds: target ? [target.player.id] : [] },
    });

    const faded = fadedSignals.find((candidate) => candidate.player.id === target?.player.id);
    expect(faded?.score).toBeLessThan(target?.score ?? 100);
    expect(faded?.reasons).toContain("user faded this player");
    expect(recommendation.recommendedPlayerId).not.toBe(target?.player.id);
    expect(recommendation.assumptions.some((assumption) => assumption.includes("User faded"))).toBe(true);
  });
  it("advances the mock draft by one pick", () => {
    const state = createMockDraftState(3);
    const next = advanceMockDraftState(state);

    expect(next.picks).toHaveLength(4);
    expect(next.currentPick).toBe(5);
  });
  it("marks Sleeper-only recommendations as placeholder signals", () => {
    const state: DraftState = {
      ...createMockDraftState(0),
      players: [
        {
          id: "sleeper-1",
          sleeperId: "sleeper-1",
          name: "Sleeper Player",
          team: "FA",
          position: "WR",
          projectedPoints: 220,
          projectionSource: "sleeper_search_rank",
          adp: 12,
          tier: 1,
          riskTags: [],
        },
      ],
      picks: [],
    };

    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.headline).toBe("Placeholder lean: Sleeper Player");
    expect(recommendation.confidence).toBe("low");
    expect(recommendation.assumptions[0]).toContain("Sleeper does not provide fantasy projections");
    expect(recommendation.candidates[0]?.reasons[0]).toContain("Sleeper search rank 12");
  });
});


