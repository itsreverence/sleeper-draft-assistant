import type { DraftState } from "./types";
import { getImportFreshness } from "./freshness";

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
