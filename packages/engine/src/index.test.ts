import type { DraftState, Player, Position } from "@sleeper-ai/shared";
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
    const baseline = buildCandidateSignals(state, 20);
    const target = baseline.find((candidate) => candidate.score < 90) ?? baseline[baseline.length - 1];

    const pinnedSignals = buildCandidateSignals(state, 20, {
      preferences: { pinnedPlayerIds: target ? [target.player.id] : [] },
    });
    const recommendation = buildDraftRecommendation(state, {
      preferences: { pinnedPlayerIds: target ? [target.player.id] : [] },
    });

    const boosted = pinnedSignals.find((candidate) => candidate.player.id === target?.player.id);
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
  it("prioritizes RB/WR construction pressure in 8-team PPR leagues with two flex spots", () => {
    const state = createEightTeamTwoFlexState();
    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.candidates[0]?.player.position).toMatch(/RB|WR/);
    expect(recommendation.recommendedPlayerId).not.toBe("format-qb-allen");
    expect(recommendation.candidates[0]?.reasons).toContain("matches RB/WR flex demand");
  });

  it("explains shallow-league QB replacement pressure in small one-QB formats", () => {
    const state = createEightTeamTwoFlexState();
    const signals = buildCandidateSignals(state, 10);
    const qb = signals.find((candidate) => candidate.player.id === "format-qb-allen");

    expect(qb?.reasons).toContain("shallow league reduces replacement pressure");
  });
});
function createEightTeamTwoFlexState(): DraftState {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: `format-team-${index + 1}`,
    name: index === 0 ? "Your Team" : `Team ${index + 1}`,
    draftSlot: index + 1,
    roster: [],
  }));

  return {
    id: "format-test-draft",
    name: "8-Team PPR Two Flex",
    status: "pre_draft",
    currentPick: 1,
    userTeamId: "format-team-1",
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
      formatPlayer("format-qb-allen", "Josh Allen", "BUF", "QB", 363, 5, 1),
      formatPlayer("format-rb-gibbs", "Jahmyr Gibbs", "DET", "RB", 286, 2, 1),
      formatPlayer("format-wr-chase", "Ja'Marr Chase", "CIN", "WR", 298, 3, 1),
      formatPlayer("format-rb-bijan", "Bijan Robinson", "ATL", "RB", 282, 4, 1),
      formatPlayer("format-te-bowers", "Brock Bowers", "LV", "TE", 205, 18, 1),
      formatPlayer("format-qb-hurts", "Jalen Hurts", "PHI", "QB", 348, 20, 2),
    ],
    picks: [],
    updatedAt: new Date().toISOString(),
  };
}

function formatPlayer(
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

