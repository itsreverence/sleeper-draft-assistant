import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import {
  buildGroupedPlayerEvidence,
  createDraftPlayerSnapshot,
  createDraftStrategyTools,
} from "./draft-tools";

describe("draft AI tools", () => {
  it("searches the complete immutable pool by position without engine filtering", async () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(state, { pinned: [], faded: [], excluded: [] });
    const [search] = createDraftStrategyTools(snapshot);

    expect(search!.definition.description).toContain("captured pick number");
    expect(search!.definition.description).toContain("total matches");
    expect(search!.definition.description).toContain("without recommendation scores");

    const result = await search!.execute({
      positions: ["K", "DEF"],
      sortBy: "projection",
      limit: 10,
    }) as { basedOnPick: number; players: Array<{ position: string; playerId: string }> };

    expect(result.basedOnPick).toBe(state.currentPick);
    expect(result.players.map((player) => player.position)).toEqual(["K", "DEF"]);
    expect(result.players.map((player) => player.playerId)).toEqual(["p-tucker", "p-ravens"]);
  });

  it("honors exclusions and exposes preferences as evidence", async () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(state, {
      pinned: ["p-kelce"],
      faded: ["p-laporta"],
      excluded: ["p-allen"],
    });
    const [search] = createDraftStrategyTools(snapshot);

    const result = await search!.execute({
      positions: ["QB", "TE"],
      sortBy: "projection",
      limit: 20,
    }) as { players: Array<{ playerId: string; preference: string | null }> };

    expect(result.players.some((player) => player.playerId === "p-allen")).toBe(false);
    expect(result.players.find((player) => player.playerId === "p-kelce")?.preference).toBe("pinned");
    expect(result.players.find((player) => player.playerId === "p-laporta")?.preference).toBe("faded");
  });

  it("compares named players and reports availability without choosing a winner", async () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(state, {
      pinned: [],
      faded: [],
      excluded: ["p-kelce"],
    });
    const compare = createDraftStrategyTools(snapshot).find((tool) => tool.definition.name === "compare_players");
    expect(compare).toBeTruthy();

    const result = await compare!.execute({ playerIds: ["p-allen", "p-kelce", "missing-player"] }) as {
      basedOnPick: number;
      players: Array<{ playerId: string; availability: string; ecrVsAdp: number | null }>;
      missingPlayerIds: string[];
    };

    expect(result.basedOnPick).toBe(state.currentPick);
    expect(result.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: "p-allen", availability: "available" }),
      expect.objectContaining({ playerId: "p-kelce", availability: "excluded" }),
    ]));
    expect(result.players.find((player) => player.playerId === "p-allen")).toHaveProperty("ecrVsAdp");
    expect(result.missingPlayerIds).toEqual(["missing-player"]);
  });

  it("inspects positional supply, tiers, and teams before the next user turn", async () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(state, { pinned: [], faded: [], excluded: [] });
    const market = createDraftStrategyTools(snapshot).find((tool) => tool.definition.name === "inspect_position_market");
    expect(market).toBeTruthy();

    const result = await market!.execute({ positions: ["RB", "K"], tierLimit: 3 }) as {
      basedOnPick: number;
      userNextPick: number | null;
      markets: Array<{ position: string; availableCount: number; draftedCount: number; tiers: unknown[] }>;
      teamsSelectingBeforeNextTurn: unknown[];
    };

    expect(result.basedOnPick).toBe(state.currentPick);
    expect(result.userNextPick).toBeTypeOf("number");
    expect(result.markets.find((market) => market.position === "RB")).toMatchObject({
      availableCount: expect.any(Number),
      draftedCount: expect.any(Number),
    });
    expect(result.markets.find((market) => market.position === "K")?.tiers.length).toBeGreaterThan(0);
    expect(result.teamsSelectingBeforeNextTurn).toBeInstanceOf(Array);
  });

  it("uses normalized Sleeper pick order for traded-pick timing", async () => {
    const state = createMockDraftState(8);
    const userTeam = state.teams.find((team) => team.id === state.userTeamId)!;
    const otherTeam = state.teams.find((team) => team.id !== state.userTeamId)!;
    const pickOrder = Array.from({ length: state.settings.teams * state.settings.rounds }, (_, index) => ({
      pickNo: index + 1,
      round: Math.ceil((index + 1) / state.settings.teams),
      draftSlot: 1,
      teamId: index + 1 === state.currentPick + 1 ? userTeam.id : otherTeam.id,
      originalTeamId: otherTeam.id,
      isTraded: index + 1 === state.currentPick + 1,
    }));
    const snapshot = createDraftPlayerSnapshot(
      { ...state, pickOrder: { source: "sleeper", entries: pickOrder } },
      { pinned: [], faded: [], excluded: [] },
    );
    const market = createDraftStrategyTools(snapshot).find((tool) => tool.definition.name === "inspect_position_market");

    const result = await market!.execute({ positions: ["RB"] }) as {
      pickOrderSource: string;
      userNextPick: number | null;
      teamsSelectingBeforeNextTurn: Array<{ team: string }>;
    };

    expect(result.pickOrderSource).toBe("sleeper");
    expect(result.userNextPick).toBe(state.currentPick + 1);
    expect(result.teamsSelectingBeforeNextTurn.map((team) => team.team)).toEqual([otherTeam.name]);
  });

  it("does not invent future timing for unsupported formats", async () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(
      { ...state, pickOrder: { source: "unsupported", entries: [] } },
      { pinned: [], faded: [], excluded: [] },
    );
    const market = createDraftStrategyTools(snapshot).find((tool) => tool.definition.name === "inspect_position_market");

    const result = await market!.execute({ positions: ["RB"] }) as {
      pickOrderSource: string;
      pickOrderNote: string | null;
      userNextPick: number | null;
    };

    expect(result.pickOrderSource).toBe("unsupported");
    expect(result.userNextPick).toBeNull();
    expect(result.pickOrderNote).toContain("does not expose");
  });

  it("separates raw retrieval signals and position coverage without assigning recommendation scores", () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(state, { pinned: ["p-laporta"], faded: [], excluded: [] });
    const evidence = buildGroupedPlayerEvidence(snapshot, {
      QB: 1,
      RB: 2,
      WR: 1,
      TE: 1,
      K: 1,
      DEF: 1,
    });

    expect(evidence.playerEvidenceGroups.positionCoverage.K).toEqual(["p-tucker"]);
    expect(evidence.playerEvidenceGroups.positionCoverage.DEF).toEqual(["p-ravens"]);
    expect(evidence.playerEvidenceGroups.pinnedTargets).toEqual(["p-laporta"]);
    expect(evidence.playerEvidenceGroups.realTimeAdpLeaders).toEqual([]);
    expect(evidence.playerEvidenceGroups.projectionLeaders.length).toBeGreaterThan(0);
    expect(evidence.playerEvidence.map((player) => player.name)).toEqual(
      [...evidence.playerEvidence.map((player) => player.name)].sort((left, right) => left.localeCompare(right)),
    );
    expect(evidence.playerEvidence[0]).not.toHaveProperty("score");
    expect(evidence.playerEvidence[0]).not.toHaveProperty("reasons");
  });
});
