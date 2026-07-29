import type { DraftState, Player, Position, TeamManagerState, WeeklyProjectionImportSummary } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import {
  advanceMockDraftState,
  buildCandidateSignals,
  buildDraftRecommendation,
  buildTeamDataReadiness,
  buildTeamLineupSummary,
  buildTeamNeedsSummary,
  buildTeamWaiverSummary,
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
  it("runs the mock draft to a board-consistent completion", () => {
    let state = createMockDraftState(0);
    const totalPicks = state.settings.teams * state.settings.rounds;

    while (state.status !== "complete") {
      state = advanceMockDraftState(state);
    }

    expect(state.picks).toHaveLength(totalPicks);
    expect(state.currentPick).toBe(totalPicks);
    expect(state.teams.flatMap((team) => team.roster)).toHaveLength(totalPicks);
  });
  it("removes a drafted shortlisted player from later recommendations", () => {
    const state = createMockDraftState(0);
    const shortlistedId = buildDraftRecommendation(state).recommendedPlayerId;
    expect(shortlistedId).toBeTruthy();

    let next = state;
    while (shortlistedId && !next.picks.some((pick) => pick.playerId === shortlistedId)) {
      next = advanceMockDraftState(next);
    }

    const recommendation = buildDraftRecommendation(next, {
      preferences: { pinnedPlayerIds: shortlistedId ? [shortlistedId] : [] },
    });
    expect(recommendation.candidates.some((candidate) => candidate.player.id === shortlistedId)).toBe(false);
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
  it("does not let unmatched placeholders outrank available imported players", () => {
    const state = createMockDraftState(0);
    state.players = [
      {
        ...state.players[0]!,
        id: "retired-placeholder",
        sleeperId: "retired-placeholder",
        name: "Retired Placeholder",
        team: "FA",
        projectedPoints: 400,
        projectionSource: "sleeper_search_rank",
        adp: 1,
      },
      {
        ...state.players[1]!,
        id: "imported-player",
        sleeperId: "imported-player",
        name: "Imported Player",
        projectedPoints: 250,
        projectionSource: "season_projection",
        importedRank: 10,
        seasonProjectedPoints: 250,
        seasonProjectionSource: "FantasyPros",
        seasonProjectionSeason: "2026",
        seasonProjectionCoverage: "league_scored",
      },
    ];
    state.picks = [];

    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.recommendedPlayerId).toBe("imported-player");
    expect(recommendation.headline).toBe("Lean Imported Player");
    expect(recommendation.candidates).toHaveLength(1);
  });
  it("prioritizes RB/WR construction pressure in 8-team PPR leagues with two flex spots", () => {
    const state = createEightTeamTwoFlexState();
    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.candidates[0]?.player.position).toMatch(/RB|WR/);
    expect(recommendation.recommendedPlayerId).not.toBe("format-qb-allen");
    expect(recommendation.candidates[0]?.reasons).toContain("matches RB/WR flex demand");
  });
  it("stops recommending WR after WR has filled every starting and flex slot", () => {
    const state = createEightTeamTwoFlexState();
    const rosteredReceivers = Array.from({ length: 4 }, (_, index) =>
      formatPlayer(`rostered-wr-${index + 1}`, `Rostered WR ${index + 1}`, "SEA", "WR", 260 - index, index + 1, 1),
    );
    state.players = [...state.players, ...rosteredReceivers];
    state.teams[0]!.roster = rosteredReceivers.map((player) => player.id);
    state.picks = rosteredReceivers.map((player, index) => ({
      pickNo: index + 1,
      round: index + 1,
      draftSlot: 1,
      teamId: state.userTeamId,
      playerId: player.id,
    }));
    state.currentPick = 5;

    const recommendation = buildDraftRecommendation(state);
    const chase = buildCandidateSignals(state, state.players.length)
      .find((candidate) => candidate.player.id === "format-wr-chase");

    expect(recommendation.candidates[0]?.player.position).toBe("RB");
    expect(chase?.rosterFit).toBe("depth");
    expect(chase?.reasons).toContain("WR starting and flex capacity is already covered");
    expect(chase?.score).toBeLessThan(recommendation.candidates[0]?.score ?? 0);
  });
  it("prioritizes an empty RB room after both direct WR starters are filled", () => {
    const state = createEightTeamTwoFlexState();
    const rosteredReceivers = Array.from({ length: 2 }, (_, index) =>
      formatPlayer(`starter-wr-${index + 1}`, `Starter WR ${index + 1}`, "SEA", "WR", 270 - index, index + 1, 1),
    );
    state.players = [...state.players, ...rosteredReceivers];
    state.teams[0]!.roster = rosteredReceivers.map((player) => player.id);
    state.picks = rosteredReceivers.map((player, index) => ({
      pickNo: index + 1,
      round: index + 1,
      draftSlot: 1,
      teamId: state.userTeamId,
      playerId: player.id,
    }));
    state.currentPick = 3;

    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.candidates[0]?.player.position).toBe("RB");
    expect(recommendation.candidates[0]?.reasons).toContain("fills a RB roster need");
  });

  it("caps recommendation confidence when league settings need caution", () => {
    const state = createEightTeamTwoFlexState();
    state.settings.formatCompatibility = {
      level: "caution",
      features: ["te_premium"],
      warnings: ["TE-premium values require a matching import."],
    };
    state.players = state.players.map((player) => ({
      ...player,
      projectionSource: "season_projection",
    }));

    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.confidence).not.toBe("high");
    expect(recommendation.risks).toContain("TE-premium values require a matching import.");
  });

  it("does not let imported season signals saturate a shallow one-QB board", () => {
    const state = createEightTeamTwoFlexState();
    const importedRanks = new Map([
      ["format-qb-allen", 25],
      ["format-rb-gibbs", 4],
      ["format-wr-chase", 1],
      ["format-rb-bijan", 3],
      ["format-te-bowers", 16],
      ["format-qb-hurts", 31],
    ]);
    state.players = state.players.map((player) => ({
      ...player,
      projectionSource: "season_projection",
      importedRank: importedRanks.get(player.id),
      seasonProjectedPoints: player.projectedPoints,
      seasonProjectionSource: "FantasyPros",
      seasonProjectionSeason: "2026",
      seasonProjectionCoverage: "league_scored",
      adpSource: "FantasyPros Sleeper ADP",
    }));

    const recommendation = buildDraftRecommendation(state);
    const allen = recommendation.candidates.find((candidate) => candidate.player.id === "format-qb-allen");

    expect(recommendation.candidates[0]?.player.position).toMatch(/RB|WR/);
    expect(recommendation.recommendedPlayerId).not.toBe("format-qb-allen");
    expect(recommendation.candidates[0]?.score).toBeLessThan(100);
    expect(allen?.score).toBeLessThan(recommendation.candidates[0]?.score ?? 0);
  });

  it("uses the faster of Sleeper and real-time ADP for return probability", () => {
    const state = createEightTeamTwoFlexState();
    const player = state.players.find((candidate) => candidate.id === "format-rb-gibbs");
    if (!player) {
      throw new Error("Expected Gibbs fixture.");
    }
    player.adp = 28;
    player.realTimeAdp = 4;
    player.adpSource = "FantasyPros Sleeper ADP";

    const signal = buildCandidateSignals(state, state.players.length)
      .find((candidate) => candidate.player.id === player.id);

    expect(signal?.returnProbability).toBe(0.08);
    expect(signal?.reasons).toContain("real-time market is 24.0 picks earlier than Sleeper ADP");
  });
  it("rewards players who fall past ADP and penalizes reaches", () => {
    const state = createEightTeamTwoFlexState();
    const falling = formatPlayer("falling-wr", "Falling WR", "SEA", "WR", 280, 5, 2);
    const reach = formatPlayer("reach-wr", "Reach WR", "SEA", "WR", 280, 45, 2);
    falling.projectionSource = "season_projection";
    reach.projectionSource = "season_projection";
    falling.adpSource = "FantasyPros Sleeper ADP";
    reach.adpSource = "FantasyPros Sleeper ADP";
    state.players = [falling, reach];
    state.currentPick = 25;

    const signals = buildCandidateSignals(state, 2);
    const fallingSignal = signals.find((candidate) => candidate.player.id === falling.id);
    const reachSignal = signals.find((candidate) => candidate.player.id === reach.id);

    expect(fallingSignal?.valueLabel).toBe("major Sleeper ADP discount");
    expect(reachSignal?.valueLabel).toBe("ahead of Sleeper ADP");
    expect(fallingSignal?.score).toBeGreaterThan(reachSignal?.score ?? 0);
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

describe("full draft simulations", () => {
  it("finishes an 8-team PPR draft with every required starter position", () => {
    const state = simulateRecommendationDraft({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 2,
      BN: 5,
      K: 1,
      DEF: 1,
    });
    const counts = simulatedUserPositionCounts(state);

    expect(counts.QB).toBeGreaterThanOrEqual(1);
    expect(counts.RB).toBeGreaterThanOrEqual(2);
    expect(counts.WR).toBeGreaterThanOrEqual(2);
    expect(counts.TE).toBeGreaterThanOrEqual(1);
    expect(counts.K).toBe(1);
    expect(counts.DEF).toBe(1);
    expect(counts.QB).toBeLessThanOrEqual(2);
    expect(counts.TE).toBeLessThanOrEqual(2);
    expect(counts.RB + counts.WR + counts.TE).toBeGreaterThanOrEqual(7);
    expect(state.teams.find((team) => team.id === state.userTeamId)?.roster).toHaveLength(15);
  });

  it("drafts a second starting QB in an 8-team superflex room", () => {
    const state = simulateRecommendationDraft({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      SUPER_FLEX: 1,
      BN: 7,
    });
    const counts = simulatedUserPositionCounts(state);

    expect(counts.QB).toBeGreaterThanOrEqual(2);
    expect(counts.RB).toBeGreaterThanOrEqual(2);
    expect(counts.WR).toBeGreaterThanOrEqual(2);
    expect(counts.TE).toBeGreaterThanOrEqual(1);
  });
});

describe("team needs engine", () => {
  it("summarizes open starters, thin depth, and flex pressure", () => {
    const state = createTeamManagerState();
    const summary = buildTeamNeedsSummary(state);

    expect(summary.weakestPositions).toContain("RB");
    expect(summary.openStarterSlots).toEqual(["RB", "WR", "FLEX", "FLEX"]);
    expect(summary.thinPositions).toEqual(expect.arrayContaining(["RB", "WR"]));
    expect(summary.flexPressure).toContain("short");
    expect(summary.facts).toContain("Open starter slots: RB, WR, FLEX, FLEX.");
  });



  it("recommends lineup swaps and open slot fills", () => {
    const betterWr = teamPlayer("bench-wr-elite", "Elite Bench WR", "WR", 250, 3);
    const state = createTeamManagerState({ bench: [betterWr] });
    const summary = buildTeamLineupSummary(state);

    expect(summary.openSlots).toEqual(expect.arrayContaining(["RB", "FLEX", "FLEX"]));
    expect(summary.swapRecommendations.some((decision) => decision.currentPlayer?.id === "wr-1" && decision.recommendedPlayer?.id === "bench-wr-elite")).toBe(true);
    expect(summary.facts.some((fact) => fact.includes("Elite Bench WR over Starter WR"))).toBe(true);
  });

  it("flags risky recommended starters", () => {
    const riskyRb = { ...teamPlayer("bench-rb-risk", "Risky Bench RB", "RB", 260, 3), riskTags: ["injury: Questionable"] };
    const summary = buildTeamLineupSummary(createTeamManagerState({ bench: [riskyRb] }));

    expect(summary.riskyStarters.map((player) => player.id)).toContain("bench-rb-risk");
    expect(summary.facts.some((fact) => fact.includes("Risky Bench RB"))).toBe(true);
  });
  it("uses weekly projections to recommend a lineup swap", () => {
    const state = createTeamManagerState();
    const starterWr = state.roster.starters.find((slot) => slot.slot === "WR")?.player;
    if (!starterWr) {
      throw new Error("Expected a starting WR fixture.");
    }
    Object.assign(starterWr, {
      projectedPoints: 14.2,
      projectionSource: "weekly_projection",
      weeklyProjectedPoints: 14.2,
      weeklyProjectionSource: "FantasyPros",
      weeklyProjectionSeason: "2026",
      weeklyProjectionWeek: 1,
    });
    const weeklyBenchWr = {
      ...teamPlayer("bench-wr-weekly", "Weekly Breakout WR", "WR", 28.4, 150),
      projectionSource: "weekly_projection" as const,
      weeklyProjectedPoints: 28.4,
      weeklyProjectionSource: "FantasyPros",
      weeklyProjectionSeason: "2026",
      weeklyProjectionWeek: 1,
    };
    state.roster.bench = [weeklyBenchWr];
    state.roster.positionCounts.WR = 2;
    const summary = buildTeamLineupSummary(state);
    const swap = summary.swapRecommendations.find((decision) => decision.currentPlayer?.id === "wr-1");

    expect(swap?.recommendedPlayer?.id).toBe("bench-wr-weekly");
    expect(swap?.reasons.some((reason) => reason.includes("28.4 points"))).toBe(true);
  });
  it("suppresses weekly projection swaps that are effectively a toss-up", () => {
    const state = createTeamManagerState();
    const starterWr = state.roster.starters.find((slot) => slot.slot === "WR")?.player;
    if (!starterWr) {
      throw new Error("Expected a starting WR fixture.");
    }
    Object.assign(starterWr, weeklyProjectionFields(14.2));
    state.roster.bench = [{ ...teamPlayer("bench-wr-close", "Close Bench WR", "WR", 14.4, 100), ...weeklyProjectionFields(14.4) }];

    const summary = buildTeamLineupSummary(state);
    const decision = summary.decisions.find((item) => item.currentPlayer?.id === "wr-1");

    expect(decision?.status).toBe("locked");
    expect(decision?.confidence).toBe("low");
    expect(decision?.projectedPointDelta).toBeCloseTo(0.2);
    expect(decision?.reasons.some((reason) => reason.includes("toss-up"))).toBe(true);
  });
  it("compares complete current and optimized weekly lineup totals", () => {
    const state = createTeamManagerState();
    const openPlayers = [
      { ...teamPlayer("rb-2", "Current RB Two", "RB", 10, 50), ...weeklyProjectionFields(10) },
      { ...teamPlayer("wr-2", "Current WR Two", "WR", 10, 60), ...weeklyProjectionFields(10) },
      { ...teamPlayer("flex-rb", "Current Flex RB", "RB", 9, 70), ...weeklyProjectionFields(9) },
      { ...teamPlayer("flex-wr", "Current Flex WR", "WR", 8, 80), ...weeklyProjectionFields(8) },
    ];
    const existingStarters = state.roster.starters.map((slot) => slot.player).filter((player): player is Player => Boolean(player));
    existingStarters.forEach((player, index) => Object.assign(player, weeklyProjectionFields(12 + index)));
    let openIndex = 0;
    for (const slot of state.roster.starters) {
      if (!slot.player) {
        slot.player = openPlayers[openIndex++] ?? null;
      }
    }
    state.roster.bench = [{ ...teamPlayer("bench-wr-elite", "Elite Weekly WR", "WR", 20, 10), ...weeklyProjectionFields(20) }];

    const summary = buildTeamLineupSummary(state);

    expect(summary.currentProjectionCoverage).toBe(1);
    expect(summary.recommendedProjectionCoverage).toBe(1);
    expect(summary.currentProjectedPoints).not.toBeNull();
    expect(summary.recommendedProjectedPoints).not.toBeNull();
    expect(summary.projectedPointDelta).toBeGreaterThan(0);
    expect(summary.headline).toContain("projected points");
  });
  it("reports weekly data readiness and missing position coverage", () => {
    const state = createTeamManagerState();
    for (const player of state.roster.starters.map((slot) => slot.player).filter((player): player is Player => Boolean(player))) {
      Object.assign(player, weeklyProjectionFields(12));
    }
    const completeSummary = weeklyImportSummary(["QB", "RB", "WR", "TE"]);
    const ready = buildTeamDataReadiness(state, completeSummary);
    const partial = buildTeamDataReadiness(state, weeklyImportSummary(["QB"]));

    expect(ready.status).toBe("ready");
    expect(ready.confidence).toBe("high");
    expect(ready.rosterProjectionCoverage).toBe(1);
    expect(partial.status).toBe("partial");
    expect(partial.missingPositions).toEqual(["RB", "WR", "TE"]);
    expect(partial.warnings.some((warning) => warning.includes("Missing projection files"))).toBe(true);
  });
  it("scores weekly waiver projections on a weekly scale", () => {
    const state = createTeamManagerState();
    const weeklyCandidate = {
      ...teamPlayer("fa-weekly", "Projected Breakout", "RB", 24, 150),
      projectionSource: "weekly_projection" as const,
      weeklyProjectedPoints: 24,
      weeklyProjectionSource: "FantasyPros",
      weeklyProjectionSeason: "2026",
      weeklyProjectionWeek: 1,
    };
    const fallbackCandidate = teamPlayer("fa-fallback", "Sleeper Placeholder", "RB", 399, 1);
    const summary = buildTeamWaiverSummary(state, [fallbackCandidate, weeklyCandidate]);

    expect(summary.candidates[0]?.player.id).toBe("fa-weekly");
    expect(summary.candidates[0]?.valueLabel).toBe("24.0 weekly pts");
  });
  it("balances weekly projections with rest-of-season value for waivers", () => {
    const state = createTeamManagerState();
    const streamer = {
      ...teamPlayer("fa-streamer", "One Week Streamer", "RB", 18, 180),
      ...weeklyProjectionFields(18),
      rosRank: 200,
      rosAverageRank: 200,
      rosBestRank: 170,
      rosWorstRank: 230,
      rosSource: "FantasyPros",
      rosSeason: "2026",
      rosScoring: "PPR" as const,
    };
    const longTerm = {
      ...teamPlayer("fa-long-term", "Long Term Starter", "RB", 16, 20),
      ...weeklyProjectionFields(16),
      rosRank: 20,
      rosAverageRank: 20,
      rosBestRank: 15,
      rosWorstRank: 26,
      rosSource: "FantasyPros",
      rosSeason: "2026",
      rosScoring: "PPR" as const,
    };

    const summary = buildTeamWaiverSummary(state, [streamer, longTerm]);

    expect(summary.candidates[0]?.player.id).toBe("fa-long-term");
    expect(summary.candidates[0]?.valueLabel).toBe("16.0 weekly pts - ROS 20");
    expect(summary.candidates[0]?.reasons.some((reason) => reason.includes("expert range 15-26"))).toBe(true);
  });
  it("summarizes available add and drop candidates", () => {
    const state = createTeamManagerState({
      bench: [teamPlayer("bench-k", "Bench K", "K", 100, 260)],
    });
    const summary = buildTeamWaiverSummary(state, [
      { ...teamPlayer("fa-rb", "Free RB", "RB", 220, 24), importedRank: 24, importedSource: "FantasyPros" },
      teamPlayer("fa-qb", "Free QB", "QB", 260, 80),
    ]);

    expect(summary.candidates[0]?.player.id).toBe("fa-rb");
    expect(summary.candidates[0]?.rosterFit).toBe("starter_need");
    expect(summary.dropCandidates[0]?.player.id).toBe("bench-k");
    expect(summary.facts).toContain("Top add candidate: Free RB (RB).");
  });
  it("assigns fixed slots before flex slots deterministically", () => {
    const state = createTeamManagerState({
      bench: [
        teamPlayer("bench-rb", "Bench RB", "RB", 205, 22),
        teamPlayer("bench-wr", "Bench WR", "WR", 195, 18),
      ],
    });
    const summary = buildTeamNeedsSummary(state);

    expect(summary.lineup.find((slot) => slot.slot === "QB")?.player?.id).toBe("qb-1");
    expect(summary.lineup.filter((slot) => slot.slot === "RB").map((slot) => slot.player?.id)).toEqual(["rb-1", "bench-rb"]);
    expect(summary.lineup.find((slot) => slot.slot === "TE")?.player?.id).toBe("te-1");
    expect(summary.lineup.filter((slot) => slot.slot === "FLEX").map((slot) => slot.player?.id)).toEqual([undefined, undefined]);
  });
});

function createTeamManagerState(overrides: { bench?: Player[] } = {}): TeamManagerState {
  const qb = teamPlayer("qb-1", "Starter QB", "QB", 300, 20);
  const rb = teamPlayer("rb-1", "Starter RB", "RB", 240, 5);
  const wr = teamPlayer("wr-1", "Starter WR", "WR", 235, 6);
  const te = teamPlayer("te-1", "Starter TE", "TE", 180, 40);

  return {
    league: {
      id: "league-1",
      name: "Team League",
      season: "2026",
      status: "in_season",
      teams: 8,
      scoring: "PPR",
      rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 6 },
    },
    userTeam: { rosterId: "1", ownerId: "user-1", name: "My Team" },
    roster: {
      starters: [
        { slot: "QB", eligiblePositions: ["QB"], player: qb },
        { slot: "RB", eligiblePositions: ["RB"], player: rb },
        { slot: "RB", eligiblePositions: ["RB"], player: null },
        { slot: "WR", eligiblePositions: ["WR"], player: wr },
        { slot: "WR", eligiblePositions: ["WR"], player: null },
        { slot: "TE", eligiblePositions: ["TE"], player: te },
        { slot: "FLEX", eligiblePositions: ["RB", "WR", "TE"], player: null },
        { slot: "FLEX", eligiblePositions: ["RB", "WR", "TE"], player: null },
      ],
      bench: overrides.bench ?? [],
      injuredReserve: [],
      taxi: [],
      positionCounts: {
        QB: 1,
        RB: 1 + (overrides.bench ?? []).filter((player) => player.position === "RB").length,
        WR: 1 + (overrides.bench ?? []).filter((player) => player.position === "WR").length,
        TE: 1 + (overrides.bench ?? []).filter((player) => player.position === "TE").length,
        K: 0,
        DEF: 0,
      },
    },
    week: 1,
    updatedAt: "2026-07-08T00:00:00.000Z",
    dataQuality: {
      playerValueSource: "Sleeper roster and player metadata.",
      limitations: [],
    },
  };
}

function teamPlayer(id: string, name: string, position: Position, projectedPoints: number, adp: number): Player {
  return {
    id,
    sleeperId: id,
    name,
    team: "TST",
    position,
    projectedPoints,
    projectionSource: "sleeper_search_rank",
    adp,
    tier: 1,
    riskTags: [],
  };
}

function weeklyProjectionFields(points: number) {
  return {
    projectedPoints: points,
    projectionSource: "weekly_projection" as const,
    weeklyProjectedPoints: points,
    weeklyProjectionSource: "FantasyPros",
    weeklyProjectionSeason: "2026",
    weeklyProjectionWeek: 1,
  };
}

function weeklyImportSummary(positions: Position[]): WeeklyProjectionImportSummary {
  return {
    source: "fantasypros",
    season: "2026",
    week: 1,
    position: null,
    positions,
    positionResults: positions.map((position) => ({
      position,
      rowsParsed: 10,
      matched: 10,
      unmatched: 0,
      ambiguous: 0,
      appliedAt: "2026-09-01T00:00:00.000Z",
    })),
    rowsParsed: positions.length * 10,
    matched: positions.length * 10,
    unmatched: [],
    ambiguous: [],
    appliedAt: "2026-09-01T00:00:00.000Z",
  };
}

function simulateRecommendationDraft(rosterSlots: Record<string, number>): DraftState {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: `simulation-team-${index + 1}`,
    name: index === 4 ? "Your Team" : `Team ${index + 1}`,
    draftSlot: index + 1,
    roster: [] as string[],
  }));
  const rounds = Object.values(rosterSlots).reduce((total, count) => total + count, 0);
  const state: DraftState = {
    id: "simulation-draft",
    name: "Simulation Draft",
    status: "drafting",
    currentPick: 1,
    userTeamId: "simulation-team-5",
    settings: {
      teams: teams.length,
      rounds,
      scoring: "PPR",
      rosterSlots,
    },
    teams,
    players: createSimulationPlayerPool(),
    picks: [],
    updatedAt: "2026-07-29T00:00:00.000Z",
  };

  const totalPicks = teams.length * rounds;
  for (let pickNo = 1; pickNo <= totalPicks; pickNo += 1) {
    state.currentPick = pickNo;
    const round = Math.ceil(pickNo / teams.length);
    const pickInRound = ((pickNo - 1) % teams.length) + 1;
    const draftSlot = round % 2 === 1 ? pickInRound : teams.length + 1 - pickInRound;
    const team = state.teams.find((candidate) => candidate.draftSlot === draftSlot)!;
    const available = getAvailablePlayers(state);
    const player = team.id === state.userTeamId
      ? buildDraftRecommendation(state).candidates[0]?.player
      : [...available].sort((left, right) => (left.adp ?? 9999) - (right.adp ?? 9999))[0];
    if (!player) {
      throw new Error(`Simulation player pool exhausted at pick ${pickNo}.`);
    }

    state.picks.push({
      pickNo,
      round,
      draftSlot,
      teamId: team.id,
      playerId: player.id,
    });
    team.roster.push(player.id);
  }
  state.currentPick = totalPicks;
  state.status = "complete";
  return state;
}

function createSimulationPlayerPool(): Player[] {
  const earlyPattern: Position[] = ["RB", "WR", "RB", "WR", "WR", "RB", "QB", "TE", "WR", "RB", "QB", "WR"];
  const positions: Position[] = Array.from({ length: 180 }, (_, index) => earlyPattern[index % earlyPattern.length]!);
  positions.push(...Array.from({ length: 20 }, (_, index) => index % 2 === 0 ? "K" as const : "DEF" as const));
  const positionIndexes: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  const projectionBase: Record<Position, number> = { QB: 390, RB: 330, WR: 320, TE: 260, K: 140, DEF: 135 };
  const projectionStep: Record<Position, number> = { QB: 7, RB: 4, WR: 3.5, TE: 5, K: 2, DEF: 2 };

  return positions.map((position, index) => {
    const positionIndex = ++positionIndexes[position];
    const rank = index + 1;
    const projectedPoints = Math.max(40, projectionBase[position] - projectionStep[position] * positionIndex);
    return {
      id: `simulation-${position.toLowerCase()}-${positionIndex}`,
      sleeperId: `simulation-${position.toLowerCase()}-${positionIndex}`,
      name: `${position} Player ${positionIndex}`,
      team: "SIM",
      position,
      projectedPoints,
      projectionSource: "season_projection",
      adp: rank,
      tier: Math.ceil(positionIndex / 8),
      riskTags: [],
      importedRank: rank,
      seasonProjectedPoints: projectedPoints,
      seasonProjectionSource: "Simulation",
      seasonProjectionSeason: "2026",
      seasonProjectionCoverage: "league_scored",
      adpSource: "Simulation ADP",
    };
  });
}

function simulatedUserPositionCounts(state: DraftState): Record<Position, number> {
  const userTeam = state.teams.find((team) => team.id === state.userTeamId)!;
  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const playerId of userTeam.roster) {
    const player = playersById.get(playerId);
    if (player) {
      counts[player.position] += 1;
    }
  }
  return counts;
}


