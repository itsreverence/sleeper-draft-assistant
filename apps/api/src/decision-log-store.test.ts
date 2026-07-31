import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildDraftRecommendation, createMockDraftState } from "@sleeper-draft-assistant/engine";
import type { AiDraftDecision } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { DecisionLogStore } from "./decision-log-store";
import { SqliteAppDatabase } from "./sqlite-app-database";

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

  it("persists recommendation snapshots in SQLite", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-decisions-db-"));
    const dbPath = path.join(dir, "app.sqlite");
    const state = { ...createMockDraftState(2), leagueId: "league-db" };
    const recommendation = buildDraftRecommendation(state);
    const firstDatabase = await SqliteAppDatabase.open(dbPath);
    const firstStore = new DecisionLogStore(path.join(dir, "legacy-decision-log.json"), 200, firstDatabase);

    firstStore.record({
      draftId: state.id,
      state,
      recommendation,
      trigger: "state-load",
      userRosterId: "2",
    });

    const secondDatabase = await SqliteAppDatabase.open(dbPath);
    const secondStore = new DecisionLogStore(path.join(dir, "legacy-decision-log.json"), 200, secondDatabase);

    expect(secondStore.list(state.id)).toHaveLength(1);
    expect(secondStore.list(state.id)[0]).toMatchObject({
      leagueId: "league-db",
      trigger: "state-load",
      userRosterId: "2",
    });
  });

  it("persists the structured AI plan on strategy snapshots", () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), "sleeper-strategy-")), "decision-log.json");
    const state = createMockDraftState(2);
    const recommendation = buildDraftRecommendation(state);
    const aiStrategy: AiDraftDecision = {
      basedOnPick: state.currentPick,
      recommendedPlayerId: recommendation.recommendedPlayerId!,
      alternativePlayerIds: [],
      verdict: "strong",
      confidence: "high",
      headline: recommendation.headline,
      summary: "Build around an elite running back.",
      reasons: ["The top tier is about to close."],
      risks: [],
      plan: {
        updatedAtPick: state.currentPick,
        approach: "Build an RB and WR foundation.",
        currentPickFocus: ["RB"],
        nextTurnPriorities: ["WR"],
        positionsThatCanWait: ["QB"],
        rosterGoals: ["Add a starting receiver next."],
        watchItems: ["Monitor the remaining tier-one receivers."],
        changeSummary: "Established the initial draft plan.",
      },
    };

    const firstStore = new DecisionLogStore(filePath);
    firstStore.record({
      draftId: state.id,
      state,
      recommendation,
      aiStrategy,
      trigger: "ai-strategy",
    });

    const secondStore = new DecisionLogStore(filePath);
    expect(secondStore.list(state.id)[0]?.aiStrategy).toEqual(aiStrategy);
  });
});
