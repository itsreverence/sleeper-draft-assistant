import type { DecisionSnapshot } from "./types";

export function meaningfulStrategySnapshots(
  snapshots: DecisionSnapshot[],
): DecisionSnapshot[] {
  const strategySnapshots = snapshots.filter(
    (snapshot) => snapshot.trigger === "ai-strategy",
  );

  return strategySnapshots.filter((snapshot, index) => {
    if (index === 0) {
      return true;
    }
    return strategySignature(snapshot) !== strategySignature(strategySnapshots[index - 1]!);
  });
}

function strategySignature(snapshot: DecisionSnapshot): string {
  const plan = snapshot.aiStrategy?.plan;
  return JSON.stringify({
    pick: snapshot.currentPick,
    player: snapshot.aiStrategy?.recommendedPlayerId ?? snapshot.recommendedPlayerId,
    focus: plan?.currentPickFocus ?? [],
    next: plan?.nextTurnPriorities ?? [],
    wait: plan?.positionsThatCanWait ?? [],
  });
}
