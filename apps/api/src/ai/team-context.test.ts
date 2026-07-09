import type { Player, TeamActivitySummary, TeamLineupSummary, TeamManagerState, TeamWaiverSummary, TeamWeekContext } from "@sleeper-ai/shared";
import { describe, expect, it } from "vitest";

import { buildTeamAiContext } from "./team-context";
import { buildTeamManagerInstructions, buildTeamManagerPrompt } from "./prompt";
import { NoopAiProvider } from "./noop-provider";

describe("team AI context", () => {
  it("builds a grounded team-management brief", () => {
    const state = createTeamState();
    const context = buildTeamAiContext(state, "What is my weakest position?", [
      { role: "user", content: "Previous question" },
    ]);

    expect(context.task).toBe("team_question");
    expect(context.teamBrief.leagueFormat).toContain("8-team PPR");
    expect(context.teamBrief.openStarterSlots).toContain("WR (WR)");
    expect(context.teamNeeds.weakestPositions).toContain("RB");
    expect(context.teamBrief.deterministicFacts).toContain("WR has 1/2 required starter slots covered.");
    expect(context.teamNeeds.flexPressure).toContain("RB/WR/TE flex depth is short");
    expect(context.teamBrief.responseRules).toContain("Use weekContext only for current Sleeper matchup, lineup, and score state; do not treat it as projections.");
  });


  it("includes Sleeper weekly matchup facts when available", () => {
    const context = buildTeamAiContext(createTeamState(), "Am I ahead?", [], createWeekContext());

    expect(context.weekContext?.opponentTeamName).toBe("Opponent Team");
    expect(context.teamBrief.matchupFacts).toContain("Current Sleeper score: 91.50 to 88.10.");
    expect(context.teamBrief.opponent).toBe("Opponent Team");
    expect(context.teamBrief.dataWarnings).toContain("Sleeper matchup data is current lineup and points state, not a projection model.");
  });



  it("includes Sleeper activity facts for market questions", () => {
    const context = buildTeamAiContext(createTeamState(), "Who is trending?", [], null, null, null, createActivitySummary());

    expect(context.activitySummary.trendingAdds[0]?.player.name).toBe("Trending RB");
    expect(context.teamBrief.activityFacts).toContain("Top global add: Trending RB (50 adds).");
    expect(context.teamBrief.trendingAdds[0]).toContain("Trending RB");
    expect(context.teamBrief.recentTransactions[0]).toContain("added Trending RB");
  });
  it("includes lineup decisions for start/sit questions", () => {
    const context = buildTeamAiContext(createTeamState(), "Who should I start?", [], null, null, createLineupSummary());

    expect(context.lineupSummary.swapRecommendations[0]?.recommendedPlayer?.name).toBe("Bench WR");
    expect(context.teamBrief.lineupFacts).toContain("Consider Bench WR over Ja'Marr Chase at WR.");
    expect(context.teamBrief.lineupDecisions[0]).toContain("Bench WR");
  });
  it("includes waiver candidates for add/drop questions", () => {
    const context = buildTeamAiContext(createTeamState(), "Who should I add?", [], null, createWaiverSummary());

    expect(context.waiverSummary.candidates[0]?.player.name).toBe("Free RB");
    expect(context.teamBrief.waiverFacts).toContain("Top add candidate: Free RB (RB).");
    expect(context.teamBrief.topWaiverCandidates[0]).toContain("Free RB");
    expect(context.teamBrief.topDropCandidates[0]).toContain("Bench WR");
  });
  it("puts the team brief contract before full context in the prompt", () => {
    const context = buildTeamAiContext(createTeamState(), "Who are my likely starters?");
    const prompt = buildTeamManagerPrompt(context);

    expect(prompt).toContain("Team brief contract JSON:");
    expect(prompt).toContain("Full team context JSON:");
    expect(prompt.indexOf("Team brief contract JSON:")).toBeLessThan(prompt.indexOf("Full team context JSON:"));
    expect(prompt).toContain("teamBrief.lineupDecisions");
    expect(buildTeamManagerInstructions()).toContain("Use teamBrief first");
  });

  it("answers through the deterministic fallback provider", async () => {
    const context = buildTeamAiContext(createTeamState(), "Where is my bench thin?");
    const provider = new NoopAiProvider();

    const answer = await provider.answerTeamQuestion(context);

    expect(answer.provider.id).toBe("noop");
    expect(answer.answer).toContain("deterministic Sleeper team context");
    expect(answer.answer).toContain("Fixture Team");
  });
});

function createActivitySummary(): TeamActivitySummary {
  const trending = player("trend-rb", "Trending RB", "ATL", "RB");
  return {
    headline: "Top global add: Trending RB (50 adds).",
    week: 1,
    recentTransactions: [
      {
        id: "tx-1",
        type: "free_agent",
        status: "complete",
        createdAt: "2026-09-01T00:00:00.000Z",
        rosterIds: ["1"],
        addedPlayers: [trending],
        droppedPlayers: [],
        waiverBid: null,
        description: "free agent: added Trending RB",
      },
    ],
    trendingAdds: [{ player: trending, count: 50, direction: "add" }],
    trendingDrops: [],
    facts: ["Top global add: Trending RB (50 adds)."],
    limitations: ["Sleeper activity reflects transactions and trending add/drop counts, not projections or news analysis."],
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}
function createLineupSummary(): TeamLineupSummary {
  const current = player("wr-1", "Ja'Marr Chase", "CIN", "WR");
  const recommended = player("bench-wr", "Bench WR", "SEA", "WR");
  const decision = {
    slot: "WR",
    currentPlayer: current,
    recommendedPlayer: recommended,
    alternativePlayers: [],
    status: "swap_recommended" as const,
    confidence: "medium" as const,
    reasons: ["Bench WR has a stronger deterministic value signal than current starter Ja'Marr Chase."],
  };
  return {
    headline: "1 lineup swap recommended.",
    decisions: [decision],
    lockedStarters: [],
    openSlots: [],
    swapRecommendations: [decision],
    riskyStarters: [],
    facts: ["Consider Bench WR over Ja'Marr Chase at WR."],
    limitations: ["Lineup decisions use roster metadata and imported ranks when present, not weekly projections or player news."],
  };
}
function createWaiverSummary(): TeamWaiverSummary {
  return {
    headline: "Top available signal: Free RB.",
    candidates: [
      {
        player: player("fa-rb", "Free RB", "ATL", "RB"),
        score: 150,
        rosterFit: "starter_need",
        valueLabel: "Rank 25",
        suggestedDrop: player("bench-wr", "Bench WR", "SEA", "WR"),
        reasons: ["RB is an open starter need.", "FantasyPros import rank 25."],
      },
    ],
    dropCandidates: [
      { player: player("bench-wr", "Bench WR", "SEA", "WR"), score: 80, reasons: ["Bench player with the weakest deterministic value signal."] },
    ],
    facts: ["Top add candidate: Free RB (RB)."],
    limitations: ["Waiver candidates use available Sleeper player metadata and imported rankings when present, not real-time projections or news."],
  };
}
function createWeekContext(): TeamWeekContext {
  return {
    week: 1,
    matchupId: 4,
    status: "in_progress",
    userRosterId: "1",
    opponentRosterId: "2",
    userTeamName: "Fixture Team",
    opponentTeamName: "Opponent Team",
    userPoints: 91.5,
    opponentPoints: 88.1,
    userStarters: [{ playerId: "qb-1", name: "Josh Allen", team: "BUF", position: "QB", slot: "QB", points: 24.2 }],
    opponentStarters: [],
    facts: ["Week 1 Sleeper matchup data is loaded.", "Opponent: Opponent Team.", "Current Sleeper score: 91.50 to 88.10."],
    limitations: ["Sleeper matchup data is current lineup and points state, not a projection model."],
    updatedAt: "2026-07-08T00:00:00.000Z",
  };
}
function createTeamState(): TeamManagerState {
  const qb = player("qb-1", "Josh Allen", "BUF", "QB");
  const rb = player("rb-1", "Jahmyr Gibbs", "DET", "RB");
  const wr = player("wr-1", "Ja'Marr Chase", "CIN", "WR");
  const te = player("te-1", "Brock Bowers", "LV", "TE");

  return {
    league: {
      id: "league-1",
      name: "Fixture League",
      season: "2026",
      status: "in_season",
      teams: 8,
      scoring: "PPR",
      rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 6 },
    },
    userTeam: {
      rosterId: "1",
      ownerId: "user-1",
      name: "Fixture Team",
    },
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
      bench: [],
      injuredReserve: [],
      taxi: [],
      positionCounts: { QB: 1, RB: 1, WR: 1, TE: 1, K: 0, DEF: 0 },
    },
    week: 1,
    updatedAt: "2026-07-08T00:00:00.000Z",
    dataQuality: {
      playerValueSource: "Sleeper roster and player metadata. This is roster visibility, not projections.",
      limitations: ["Sleeper roster data does not include full fantasy projections."],
    },
  };
}

function player(id: string, name: string, team: string, position: Player["position"]): Player {
  return {
    id,
    sleeperId: id,
    name,
    team,
    position,
    projectedPoints: 0,
    projectionSource: "sleeper_search_rank",
    adp: null,
    tier: null,
    riskTags: [],
  };
}








