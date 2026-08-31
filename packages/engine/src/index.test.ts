import type { DraftState, Player, Position, TeamManagerState, WeeklyProjectionImportSummary } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import {
  advanceMockDraftState,
  buildDraftOptions,
  buildDraftRecommendation,
  buildTeamDataReadiness,
  createMockDraftState,
  getAvailablePlayers,
  isDraftChoiceRosterFeasible,
} from "./index";

describe("mock draft engine", () => {
  it("removes drafted players from the available pool", () => {
    const state = createMockDraftState(5);
    const available = getAvailablePlayers(state);

    expect(available.some((player) => player.id === "p-jefferson")).toBe(false);
    expect(available.length).toBe(state.players.length - 5);
  });

  it("builds a transparent reference board", () => {
    const state = createMockDraftState(12);
    const options = buildDraftOptions(state, 5);

    expect(options).toHaveLength(5);
    expect(options[0]?.orderLabel).toBeTruthy();
    expect(options[0]?.evidence.length).toBeGreaterThan(0);
    expect(options.every((option) => typeof option.requiredToCompleteLineup === "boolean")).toBe(true);
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

  it("puts pinned players first and records the preference as an assumption", () => {
    const state = createMockDraftState(12);
    const baseline = buildDraftOptions(state, 20);
    const target = baseline.at(-1);

    const pinnedOptions = buildDraftOptions(state, 20, {
      preferences: { pinnedPlayerIds: target ? [target.player.id] : [] },
    });
    const recommendation = buildDraftRecommendation(state, {
      preferences: { pinnedPlayerIds: target ? [target.player.id] : [] },
    });

    expect(pinnedOptions[0]?.player.id).toBe(target?.player.id);
    expect(recommendation.assumptions.some((assumption) => assumption.includes("User pinned"))).toBe(true);
  });

  it("puts faded players after unmodified options and records the preference", () => {
    const state = createMockDraftState(12);
    const baseline = buildDraftOptions(state, 20);
    const target = baseline[0];

    const fadedOptions = buildDraftOptions(state, 20, {
      preferences: { fadedPlayerIds: target ? [target.player.id] : [] },
    });
    const recommendation = buildDraftRecommendation(state, {
      preferences: { fadedPlayerIds: target ? [target.player.id] : [] },
    });

    expect(fadedOptions[0]?.player.id).not.toBe(target?.player.id);
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

    expect(recommendation.headline).toContain("Sleeper Player");
    expect(recommendation.confidence).toBe("low");
    expect(recommendation.assumptions[0]).toContain("Sleeper does not provide fantasy projections");
    expect(recommendation.candidates[0]?.evidence[0]).toContain("Sleeper placeholder rank 12");
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
    expect(recommendation.headline).toContain("Imported Player");
    expect(recommendation.candidates).toHaveLength(1);
  });
  it("orders imported options by ECR without strategic roster reweighting", () => {
    const state = createEightTeamTwoFlexState();
    state.players = state.players.map((player, index) => ({
      ...player,
      projectionSource: "imported",
      importedRank: index + 1,
      importedSource: "FantasyPros",
    }));
    const recommendation = buildDraftRecommendation(state);

    expect(recommendation.recommendedPlayerId).toBe("format-qb-allen");
    expect(recommendation.candidates[0]?.orderSource).toBe("ecr");
    expect(recommendation.summary).toContain("not a strategic recommendation");
  });

  it("keeps local references low confidence and exposes format warnings", () => {
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

    expect(recommendation.confidence).toBe("low");
    expect(recommendation.risks).toContain("TE-premium values require a matching import.");
  });

  it("uses season projection when ECR is unavailable", () => {
    const state = createEightTeamTwoFlexState();
    state.players = state.players.map((player) => ({
      ...player,
      projectionSource: "season_projection",
      seasonProjectedPoints: player.projectedPoints,
      seasonProjectionSource: "FantasyPros",
      seasonProjectionSeason: "2026",
      seasonProjectionCoverage: "league_scored",
    }));

    const options = buildDraftOptions(state, state.players.length);
    expect(options[0]?.player.id).toBe("format-qb-allen");
    expect(options[0]?.orderSource).toBe("projection");
  });

  it("shows both Sleeper and real-time ADP as evidence", () => {
    const state = createEightTeamTwoFlexState();
    const player = state.players.find((candidate) => candidate.id === "format-rb-gibbs");
    if (!player) {
      throw new Error("Expected Gibbs fixture.");
    }
    player.adp = 28;
    player.realTimeAdp = 4;
    player.adpSource = "FantasyPros Sleeper ADP";

    const option = buildDraftOptions(state, state.players.length)
      .find((candidate) => candidate.player.id === player.id);

    expect(option?.evidence).toContain("Sleeper ADP 28.0");
    expect(option?.evidence).toContain("Real-Time ADP 4.0");
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
  it("hard-requires K and DEF when only two roster selections remain", () => {
    const teams = Array.from({ length: 8 }, (_, index) => ({
      id: `endgame-team-${index + 1}`,
      name: `Team ${index + 1}`,
      draftSlot: index + 1,
      roster: [] as string[],
    }));
    const userTeam = teams[4]!;
    const rosterPositions: Position[] = ["QB", "RB", "RB", "RB", "RB", "WR", "WR", "WR", "WR", "WR", "TE", "TE", "TE"];
    const rosterPlayers = rosterPositions.map((position, index) =>
      formatPlayer(`endgame-${position.toLowerCase()}-${index + 1}`, `Roster ${position} ${index + 1}`, "SIM", position, 250 - index, index + 1, 1),
    );
    userTeam.roster = rosterPlayers.map((player) => player.id);
    const state: DraftState = {
      id: "endgame-draft",
      name: "Endgame Draft",
      status: "drafting",
      currentPick: 108,
      userTeamId: userTeam.id,
      settings: {
        teams: 8,
        rounds: 15,
        scoring: "PPR",
        rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 5, K: 1, DEF: 1 },
      },
      teams,
      players: [
        ...rosterPlayers,
        formatPlayer("endgame-elite-wr", "Elite Bench WR", "SIM", "WR", 400, 1, 1),
        formatPlayer("endgame-k", "Available Kicker", "SIM", "K", 1, 250, 20),
        formatPlayer("endgame-def", "Available Defense", "SIM", "DEF", 1, 251, 20),
      ],
      picks: rosterPlayers.map((player, index) => ({
        pickNo: index + 1,
        round: Math.floor(index / 8) + 1,
        draftSlot: userTeam.draftSlot,
        teamId: userTeam.id,
        playerId: player.id,
      })),
      updatedAt: "2026-07-29T00:00:00.000Z",
    };

    const firstRecommendation = buildDraftRecommendation(state);
    expect(isDraftChoiceRosterFeasible(state, "endgame-elite-wr")).toBe(false);
    expect(isDraftChoiceRosterFeasible(state, "endgame-k")).toBe(true);
    expect(isDraftChoiceRosterFeasible(state, "endgame-def")).toBe(true);
    expect(firstRecommendation.candidates.map((candidate) => candidate.player.position).sort()).toEqual(["DEF", "K"]);
    expect(firstRecommendation.candidates.every((candidate) => candidate.requiredToCompleteLineup)).toBe(true);
    expect(firstRecommendation.headline).toMatch(/^Required (K|DEF) reference:/);
    expect(firstRecommendation.summary).toContain("remaining starter requirements");

    const selected = firstRecommendation.candidates[0]!.player;
    userTeam.roster.push(selected.id);
    state.picks.push({
      pickNo: 108,
      round: 14,
      draftSlot: userTeam.draftSlot,
      teamId: userTeam.id,
      playerId: selected.id,
    });
    state.currentPick = 117;

    const finalRecommendation = buildDraftRecommendation(state);
    const remainingPosition = selected.position === "K" ? "DEF" : "K";
    expect(finalRecommendation.candidates).toHaveLength(1);
    expect(finalRecommendation.candidates[0]?.player.position).toBe(remainingPosition);
    expect(finalRecommendation.headline).toMatch(new RegExp(`^Required ${remainingPosition} reference:`));
  });

  it("hard-requires a flex-eligible player when the final starter slot is open", () => {
    const userTeam = {
      id: "flex-team",
      name: "Your Team",
      draftSlot: 1,
      roster: [] as string[],
    };
    const roster = [
      formatPlayer("flex-qb", "Roster QB", "SIM", "QB", 300, 1, 1),
      formatPlayer("flex-rb", "Roster RB", "SIM", "RB", 250, 2, 1),
      formatPlayer("flex-wr", "Roster WR", "SIM", "WR", 240, 3, 1),
      formatPlayer("flex-te", "Roster TE", "SIM", "TE", 180, 4, 1),
      formatPlayer("flex-backup-qb", "Elite Backup QB", "SIM", "QB", 500, 5, 1),
    ];
    userTeam.roster = roster.map((player) => player.id);
    const state: DraftState = {
      id: "flex-endgame-draft",
      name: "Flex Endgame",
      status: "drafting",
      currentPick: 6,
      userTeamId: userTeam.id,
      settings: {
        teams: 1,
        rounds: 6,
        scoring: "PPR",
        rosterSlots: { QB: 1, RB: 1, WR: 1, TE: 1, FLEX: 1, BN: 1 },
      },
      teams: [userTeam],
      players: [
        ...roster,
        formatPlayer("flex-option", "Available Flex", "SIM", "WR", 1, 200, 20),
        formatPlayer("flex-qb-option", "Available QB", "SIM", "QB", 600, 6, 1),
      ],
      picks: roster.map((player, index) => ({
        pickNo: index + 1,
        round: index + 1,
        draftSlot: userTeam.draftSlot,
        teamId: userTeam.id,
        playerId: player.id,
      })),
      updatedAt: "2026-07-29T00:00:00.000Z",
    };

    const recommendation = buildDraftRecommendation(state);
    expect(recommendation.candidates).toHaveLength(1);
    expect(recommendation.candidates[0]?.player.id).toBe("flex-option");
  });

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

describe("team data readiness", () => {
  it("reports weekly evidence coverage without making a lineup recommendation", () => {
    const state = createTeamManagerState();
    for (const player of state.roster.starters.map((slot) => slot.player).filter((player): player is Player => Boolean(player))) {
      Object.assign(player, weeklyProjectionFields(12));
    }
    const now = Date.parse("2026-09-02T00:00:00.000Z");
    const ready = buildTeamDataReadiness(state, weeklyImportSummary(["QB", "RB", "WR", "TE"]), now);
    const partial = buildTeamDataReadiness(state, weeklyImportSummary(["QB"]), now);

    expect(ready.status).toBe("ready");
    expect(ready.confidence).toBe("high");
    expect(ready.rosterProjectionCoverage).toBe(1);
    expect(ready.headline).toBe("Weekly evidence is ready for Codex.");
    expect(partial.status).toBe("partial");
    expect(partial.missingPositions).toEqual(["RB", "WR", "TE"]);
    expect(partial.warnings.some((warning) => warning.includes("Missing projection files"))).toBe(true);
  });

  it("does not report stale weekly evidence as ready for Codex", () => {
    const state = createTeamManagerState();
    for (const player of state.roster.starters.map((slot) => slot.player).filter((player): player is Player => Boolean(player))) {
      Object.assign(player, weeklyProjectionFields(12));
    }
    const summary = weeklyImportSummary(["QB", "RB", "WR", "TE"]);
    summary.appliedAt = "2026-09-03T00:00:00.000Z";
    for (const result of summary.positionResults) result.appliedAt = "2026-09-03T00:00:00.000Z";
    summary.positionResults[1]!.appliedAt = "2026-09-01T00:00:00.000Z";

    const readiness = buildTeamDataReadiness(state, summary, Date.parse("2026-09-04T00:00:00.000Z"));

    expect(readiness.status).toBe("limited");
    expect(readiness.confidence).toBe("low");
    expect(readiness.warnings).toContain("Weekly projections are 3 or more days old; import fresh files before using weekly advice.");
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
    seasonPhase: "regular",
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
