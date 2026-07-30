import type { DraftState } from "./types";
import { getImportFreshness } from "./freshness";

export function shouldOpenDraftPreparation(
  draftId: string,
  status: DraftState["status"],
  rankingsAppliedAt: string | null,
  aiSetupAcknowledged: boolean,
  now = Date.now(),
): boolean {
  if (draftId === "mock-draft" || status === "complete") {
    return false;
  }
  return !rankingsAppliedAt
    || getImportFreshness(rankingsAppliedAt, 14, now).stale
    || !aiSetupAcknowledged;
}
