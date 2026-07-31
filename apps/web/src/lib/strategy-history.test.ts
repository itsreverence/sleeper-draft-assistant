import { describe, expect, it } from "vitest";

import type { DecisionSnapshot } from "./types";
import { meaningfulStrategySnapshots } from "./strategy-history";

describe("strategy history", () => {
  it("collapses repeated same-pick plans while preserving meaningful changes", () => {
    const snapshots = [
      snapshot("latest", 12, "rb-1", ["RB"], ["WR"]),
      snapshot("retry", 12, "rb-1", ["RB"], ["WR"]),
      snapshot("shift", 12, "wr-1", ["WR"], ["RB"]),
      snapshot("next-pick", 13, "wr-1", ["WR"], ["RB"]),
    ];

    expect(meaningfulStrategySnapshots(snapshots).map((entry) => entry.id)).toEqual([
      "latest",
      "shift",
      "next-pick",
    ]);
  });

  it("keeps legacy strategy snapshots readable", () => {
    const latest = snapshot("latest", 8, "rb-1", ["RB"], ["WR"]);
    const legacy = {
      ...snapshot("legacy", 7, "wr-1", ["WR"], ["RB"]),
      aiStrategy: undefined,
    };

    expect(meaningfulStrategySnapshots([latest, legacy])).toHaveLength(2);
  });
});

function snapshot(
  id: string,
  currentPick: number,
  playerId: string,
  currentPickFocus: Array<"RB" | "WR">,
  nextTurnPriorities: Array<"RB" | "WR">,
): DecisionSnapshot {
  return {
    id,
    trigger: "ai-strategy",
    createdAt: "2026-07-30T12:00:00.000Z",
    currentPick,
    picksMade: currentPick - 1,
    recommendedPlayerId: playerId,
    headline: `Take ${playerId}`,
    confidence: "high",
    aiStrategy: {
      basedOnPick: currentPick,
      recommendedPlayerId: playerId,
      alternativePlayerIds: [],
      verdict: "strong",
      confidence: "high",
      headline: `Take ${playerId}`,
      summary: "Best fit for the current build.",
      reasons: ["Strong value."],
      risks: [],
      plan: {
        updatedAtPick: currentPick,
        approach: "Build through premium RB and WR value.",
        currentPickFocus,
        nextTurnPriorities,
        positionsThatCanWait: ["QB"],
        rosterGoals: ["Complete the RB/WR foundation."],
        watchItems: [],
        changeSummary: "Adjusted to the latest board.",
      },
    },
    context: {
      topCandidates: [],
      assumptions: [],
      risks: [],
    },
  };
}
