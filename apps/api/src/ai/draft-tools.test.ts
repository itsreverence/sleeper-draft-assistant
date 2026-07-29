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
