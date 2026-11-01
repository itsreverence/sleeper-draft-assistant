import type { DraftState } from "./types";
import { getImportFreshness } from "./freshness";

export type DraftPreparationStep = "rankings" | "projections" | "adp" | "assistant";

export type DraftPreparationReadiness = {
  hasRankings: boolean;
  rankingsStale: boolean;
  hasProjections: boolean;
  hasAdp: boolean;
  aiConfigured: boolean;
};

// Screen order, so the single primary action walks down the page.
export function remainingDraftPreparationSteps(readiness: DraftPreparationReadiness): DraftPreparationStep[] {
  const steps: Array<[DraftPreparationStep, boolean]> = [
    ["rankings", readiness.hasRankings && !readiness.rankingsStale],
    ["projections", readiness.hasProjections],
    ["adp", readiness.hasAdp],
    ["assistant", readiness.aiConfigured],
  ];
  return steps.filter(([, done]) => !done).map(([step]) => step);
}

// Null means ready to enter.
export function nextDraftPreparationStep(readiness: DraftPreparationReadiness): DraftPreparationStep | null {
  return remainingDraftPreparationSteps(readiness)[0] ?? null;
}

const STEP_COUNT_WORDS = ["", "One step", "Two steps", "Three steps", "Four steps"];

export function draftPreparationHeading(view: {
  draftComplete: boolean;
  assistantChecking: boolean;
  remaining: number;
}): string {
  if (view.draftComplete) return "Draft is over";
  // Until the provider answers, a count of remaining steps could be off by one.
  if (view.assistantChecking) return "Checking the Assistant";
  if (view.remaining === 0) return "Ready for the draft room";
  return `${STEP_COUNT_WORDS[view.remaining]} before the draft room`;
}

export function shouldOpenDraftPreparation(
  draftId: string,
  status: DraftState["status"],
  readiness: {
    rankingsAppliedAt: string | null;
    hasProjections: boolean;
    hasAdp: boolean;
    aiReady: boolean;
  },
  now = Date.now(),
): boolean {
  if (draftId === "mock-draft" || status === "complete") {
    return false;
  }
  return !readiness.rankingsAppliedAt
    || getImportFreshness(readiness.rankingsAppliedAt, 14, now).stale
    || !readiness.hasProjections
    || !readiness.hasAdp
    || !readiness.aiReady;
}

export function hasMatchedImport(summary: { matched: number } | null): boolean {
  return Boolean(summary && summary.matched > 0);
}
