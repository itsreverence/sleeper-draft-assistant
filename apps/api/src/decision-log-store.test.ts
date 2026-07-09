import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildDraftRecommendation, createMockDraftState } from "@sleeper-ai/engine";
import { describe, expect, it } from "vitest";

import { DecisionLogStore } from "./decision-log-store";

describe("DecisionLogStore", () => {
  it("persists recommendation snapshots by draft", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-decisions-")), "decision-log.json");
    const state = { ...createMockDraftState(2), leagueId: "league-1" };
    const recommendation = buildDraftRecommendation(state);
    const firstStore = new DecisionLogStore(filePath);

    const snapshot = firstStore.record({
      draftId: state.id,
      state,
      recommendation,
      trigger: "manual-refresh",
      userRosterId: "1",
    });

    expect(snapshot.leagueId).toBe("league-1");
    expect(snapshot.recommendedPlayerId).toBe(recommendation.recommendedPlayerId);
    expect(snapshot.context.topCandidates.length).toBeGreaterThan(0);

    const secondStore = new DecisionLogStore(filePath);
    expect(secondStore.list(state.id)).toHaveLength(1);
    expect(secondStore.list(state.id)[0]).toMatchObject({
      draftId: state.id,
      trigger: "manual-refresh",
      userRosterId: "1",
    });
  });
});