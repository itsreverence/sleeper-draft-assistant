import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import {
  buildNeutralInitialPlayerPool,
  createDraftPlayerSnapshot,
  createDraftStrategyTools,
} from "./draft-tools";

describe("draft AI tools", () => {
  it("searches the complete immutable pool by position without engine filtering", async () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(state, { pinned: [], faded: [], excluded: [] });
    const [search] = createDraftStrategyTools(snapshot);

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

  it("seeds open K and DEF positions without assigning a recommendation score", () => {
    const state = createMockDraftState(8);
    const snapshot = createDraftPlayerSnapshot(state, { pinned: [], faded: [], excluded: [] });
    const pool = buildNeutralInitialPlayerPool(snapshot, {
      QB: 1,
      RB: 2,
      WR: 1,
      TE: 1,
      K: 1,
      DEF: 1,
    });

    expect(pool.some((player) => player.position === "K")).toBe(true);
    expect(pool.some((player) => player.position === "DEF")).toBe(true);
    expect(pool[0]).not.toHaveProperty("score");
    expect(pool[0]).not.toHaveProperty("reasons");
  });
});
