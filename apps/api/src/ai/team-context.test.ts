import type { Player, TeamActivitySummary, TeamManagerState, TeamWeekContext } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { buildTeamAiContext } from "./team-context";
import { buildTeamManagerInstructions, buildTeamManagerPrompt } from "./prompt";
import { NoopAiProvider } from "./noop-provider";

describe("team AI context", () => {
  it("builds a neutral team-management brief without local strategic conclusions", () => {
    const context = buildTeamAiContext(createTeamState(), "What is my weakest position?", [
      { role: "user", content: "Previous question" },
    ]);

    expect(context.task).toBe("team_question");
    expect(context.teamBrief.leagueFormat).toContain("8-team PPR");
    expect(context.teamBrief.openStarterSlots).toContain("WR (WR)");
    expect(context.teamBrief.starterCandidates).toContain("RB: open (RB)");
    expect(context.teamBrief.responseRules).toContain("Reason independently. No local lineup, waiver, drop, or roster-priority recommendation has been supplied.");
    expect(JSON.stringify(context)).not.toContain("weakestPositions");
    expect(JSON.stringify(context)).not.toContain("swapRecommendations");
    expect(JSON.stringify(context)).not.toContain("topWaiverCandidates");
  });

  it("keeps weekly and rest-of-season available-player signals separate", () => {
    const weekly = {
      ...player("weekly-rb", "Weekly RB", "ATL", "RB"),
      ...weeklyProjectionFields(18),
      sleeperStatus: sleeperStatus(),
    };
    const longTerm = { ...player("ros-rb", "ROS RB", "DET", "RB"), rosRank: 12, rosBestRank: 8, rosWorstRank: 18 };
    const context = buildTeamAiContext(createTeamState(), "Who should I add?", [], null, [longTerm, weekly]);

    expect(context.availablePlayerGroups.weeklyProjectionLeaders).toEqual(["weekly-rb"]);
    expect(context.availablePlayerGroups.restOfSeasonRankLeaders).toEqual(["ros-rb"]);
    expect(context.availablePlayerEvidence.map((item) => item.name)).toEqual(["ROS RB", "Weekly RB"]);
    expect(context.availablePlayerEvidence.find((item) => item.playerId === "weekly-rb")?.weeklyProjectedPoints).toBe(18);
    expect(context.availablePlayerEvidence.find((item) => item.playerId === "weekly-rb")?.sleeperStatus).toEqual(sleeperStatus());
    expect(context.availablePlayerEvidence.find((item) => item.playerId === "ros-rb")?.restOfSeasonRank).toBe(12);
  });

  it("promotes Sleeper status into the concise roster brief", () => {
    const state = createTeamState();
    const rb = state.roster.starters.find((slot) => slot.player?.id === "rb-1")?.player;
    if (!rb) throw new Error("Expected RB fixture");
    rb.sleeperStatus = sleeperStatus();
    rb.riskTags = ["injury: Questionable"];

    const context = buildTeamAiContext(state, "Is my running back healthy?");

    expect(context.teamBrief.starterCandidates.find((item) => item.startsWith("RB:"))).toContain("injury Questionable");
    expect(context.teamBrief.starterCandidates.find((item) => item.startsWith("RB:"))).toContain("practice Limited Participation in Practice");
    expect(context.teamBrief.starterCandidates.find((item) => item.startsWith("RB:"))).toContain("depth RB1");
    expect(context.teamBrief.starterCandidates.find((item) => item.startsWith("RB:"))?.match(/Questionable/g)).toHaveLength(1);
  });

  it("includes Sleeper weekly matchup and activity facts without turning them into advice", () => {
    const context = buildTeamAiContext(createTeamState(), "Am I ahead?", [], createWeekContext(), [], createActivitySummary());

    expect(context.weekContext?.opponentTeamName).toBe("Opponent Team");
    expect(context.teamBrief.matchupFacts).toContain("Current Sleeper score: 91.50 to 88.10.");
    expect(context.teamBrief.trendingAdds[0]).toContain("Trending RB");
    expect(context.teamBrief.recentTransactions[0]).toContain("added Trending RB");
  });

  it("puts the neutral team brief before full context in the prompt", () => {
    const context = buildTeamAiContext(createTeamState(), "Who are my likely starters?");
    const prompt = buildTeamManagerPrompt(context);

    expect(prompt.indexOf("Team brief contract JSON:")).toBeLessThan(prompt.indexOf("Full team context JSON:"));
    expect(prompt).toContain("No local lineup, waiver, drop, or roster-priority recommendation");
    expect(prompt).toContain("availablePlayerEvidence");
    expect(prompt).not.toContain("teamBrief.lineupDecisions");
    expect(buildTeamManagerInstructions()).toContain("Reason independently");
    expect(buildTeamManagerInstructions()).toContain("newsUpdatedAt");
  });

  it("does not substitute deterministic advice when Codex is disconnected", async () => {
    const context = buildTeamAiContext(createTeamState(), "Where is my bench thin?");
    const answer = await new NoopAiProvider().answerTeamQuestion(context);

    expect(answer.provider.id).toBe("noop");
    expect(answer.answer).toContain("no team-management recommendation is available");
    expect(answer.answer).toContain("Connect Codex");
  });
});

function createActivitySummary(): TeamActivitySummary {
  const trending = player("trend-rb", "Trending RB", "ATL", "RB");
  return {
    headline: "Top global add: Trending RB (50 adds).",
    week: 1,
    recentTransactions: [{
      id: "tx-1",
      type: "free_agent",
      status: "complete",
      createdAt: "2026-09-01T00:00:00.000Z",
      rosterIds: ["1"],
      addedPlayers: [trending],
      droppedPlayers: [],
      waiverBid: null,
      description: "free agent: added Trending RB",
    }],
    trendingAdds: [{ player: trending, count: 50, direction: "add" }],
    trendingDrops: [],
    facts: ["Top global add: Trending RB (50 adds)."],
    limitations: ["Sleeper activity reflects transactions and trending add/drop counts, not projections or news analysis."],
    updatedAt: "2026-09-01T00:00:00.000Z",
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
    league: { id: "league-1", name: "Fixture League", season: "2026", status: "in_season", teams: 8, scoring: "PPR", rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, BN: 6 } },
    userTeam: { rosterId: "1", ownerId: "user-1", name: "Fixture Team" },
    roster: {
      starters: [
        { slot: "QB", eligiblePositions: ["QB"], player: qb },
        { slot: "RB", eligiblePositions: ["RB"], player: rb },
        { slot: "RB", eligiblePositions: ["RB"], player: null },
        { slot: "WR", eligiblePositions: ["WR"], player: wr },
        { slot: "WR", eligiblePositions: ["WR"], player: null },
        { slot: "TE", eligiblePositions: ["TE"], player: te },
      ],
      bench: [], injuredReserve: [], taxi: [],
      positionCounts: { QB: 1, RB: 1, WR: 1, TE: 1, K: 0, DEF: 0 },
    },
    seasonPhase: "regular",
    week: 1,
    updatedAt: "2026-07-08T00:00:00.000Z",
    dataQuality: { playerValueSource: "Sleeper roster and player metadata.", limitations: ["Sleeper roster data does not include player news."] },
  };
}

function player(id: string, name: string, team: string, position: Player["position"]): Player {
  return { id, sleeperId: id, name, team, position, projectedPoints: 0, projectionSource: "sleeper_search_rank", adp: null, tier: null, riskTags: [] };
}

function weeklyProjectionFields(points: number) {
  return {
    projectionSource: "weekly_projection" as const,
    weeklyProjectedPoints: points,
    weeklyProjectionSource: "FantasyPros",
    weeklyProjectionSeason: "2026",
    weeklyProjectionWeek: 1,
  };
}

function sleeperStatus() {
  return {
    rosterStatus: "Active",
    injuryStatus: "Questionable",
    injuryStartDate: "2026-08-24",
    practiceParticipation: "Limited Participation in Practice",
    depthChartPosition: "RB",
    depthChartOrder: 1,
    newsUpdatedAt: "2026-08-29T12:00:00.000Z",
  };
}
