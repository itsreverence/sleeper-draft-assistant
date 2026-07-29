const BASE_POLL_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function draftPollDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return BASE_POLL_DELAY_MS;
  }
  return Math.min(BASE_POLL_DELAY_MS * (2 ** Math.min(consecutiveFailures - 1, 3)), MAX_RETRY_DELAY_MS);
}

