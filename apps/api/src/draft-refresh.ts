import type { DraftState } from "@sleeper-draft-assistant/shared";

const LIVE_POLL_DELAY_MS = 2_000;
const PREDRAFT_POLL_DELAY_MS = 5_000;
const COMPLETE_POLL_DELAY_MS = 15_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function draftPollDelayMs(
  consecutiveFailures: number,
  status: DraftState["status"] = "drafting",
): number {
  const healthyDelay = status === "drafting"
    ? LIVE_POLL_DELAY_MS
    : status === "complete"
      ? COMPLETE_POLL_DELAY_MS
      : PREDRAFT_POLL_DELAY_MS;

  if (consecutiveFailures <= 0) {
    return healthyDelay;
  }
  return Math.min(PREDRAFT_POLL_DELAY_MS * (2 ** Math.min(consecutiveFailures - 1, 3)), MAX_RETRY_DELAY_MS);
}
