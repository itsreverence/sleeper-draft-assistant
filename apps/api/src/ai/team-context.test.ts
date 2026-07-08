import type { Player, TeamManagerState } from "@sleeper-ai/shared";
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
    expect(context.teamBrief.depthSignals).toContain("WR is below starter requirement (1/2).");
    expect(context.teamBrief.depthSignals.some((signal) => signal.includes("RB/WR/TE flex depth"))).toBe(true);
    expect(context.teamBrief.responseRules).toContain("Do not invent projections, injuries, matchup data, waiver-wire availability, or player news.");
  });

  it("puts the team brief contract before full context in the prompt", () => {
    const context = buildTeamAiContext(createTeamState(), "Who are my likely starters?");
    const prompt = buildTeamManagerPrompt(context);

    expect(prompt).toContain("Team brief contract JSON:");
    expect(prompt).toContain("Full team context JSON:");
    expect(prompt.indexOf("Team brief contract JSON:")).toBeLessThan(prompt.indexOf("Full team context JSON:"));
    expect(prompt).toContain("teamBrief.depthSignals");
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


