import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import { searchDraftPlayers } from "./player-search";

describe("player search", () => {
  it("finds players by exact, partial, and fuzzy names", () => {
    const state = createMockDraftState(0);
    const player = state.players[0]!;
    const firstName = player.name.split(" ")[0]!;
    const compressed = player.name.replace(/[^a-z]/gi, "").slice(0, 5);

    expect(searchDraftPlayers(state, player.name, null, {})[0]?.player.id).toBe(player.id);
    expect(searchDraftPlayers(state, firstName, null, {}).some((result) => result.player.id === player.id)).toBe(true);
    expect(searchDraftPlayers(state, compressed, null, {}).some((result) => result.player.id === player.id)).toBe(true);
  });

  it("shows saved preferences when the query is empty", () => {
    const state = createMockDraftState(0);
    const [prioritized, excluded] = state.players;
    const results = searchDraftPlayers(state, "", null, {
      [prioritized!.id]: "pin",
      [excluded!.id]: "exclude",
    });

    expect(results.map((result) => result.player.id)).toEqual([prioritized!.id, excluded!.id]);
  });

  it("labels drafted players with their actual owner and filters positions", () => {
    const state = createMockDraftState(3);
    const pick = state.picks[0]!;
    const player = state.players.find((candidate) => candidate.id === pick.playerId)!;
    const owner = state.teams.find((team) => team.id === pick.teamId)!;
    const results = searchDraftPlayers(state, player.name, player.position, {});

    expect(results[0]?.draftedBy?.id).toBe(owner.id);
    expect(results.every((result) => result.player.position === player.position)).toBe(true);
  });
});
