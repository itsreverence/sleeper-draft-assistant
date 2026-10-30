import type { DraftState } from "./types";
import { getImportFreshness } from "./freshness";

export type DraftPreparationStep = "rankings" | "projections" | "adp" | "assistant";

// Screen order, so the single primary action walks down the page. Null means ready to enter.
export function nextDraftPreparationStep(readiness: {
  hasRankings: boolean;
  rankingsStale: boolean;
  hasProjections: boolean;
  hasAdp: boolean;
  aiConfigured: boolean;
}): DraftPreparationStep | null {
  if (!readiness.hasRankings || readiness.rankingsStale) return "rankings";
  if (!readiness.hasProjections) return "projections";
  if (!readiness.hasAdp) return "adp";
  if (!readiness.aiConfigured) return "assistant";
  return null;
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
