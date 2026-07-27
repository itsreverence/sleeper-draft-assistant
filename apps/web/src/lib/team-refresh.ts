export const TEAM_REFRESH_INTERVAL_MS = 60_000;
export const TEAM_REFRESH_FOCUS_THROTTLE_MS = 10_000;

export type TeamRefreshEligibility = {
  workspaceMode: "draft" | "manage";
  manageAvailable: boolean;
  visibilityState: DocumentVisibilityState;
  isRefreshing: boolean;
  lastCheckedAt: number | null;
  now: number;
  force?: boolean;
};

export function shouldRefreshTeamManager(input: TeamRefreshEligibility): boolean {
  if (
    input.workspaceMode !== "manage" ||
    !input.manageAvailable ||
    input.visibilityState !== "visible" ||
    input.isRefreshing
  ) {
    return false;
  }

  return Boolean(
    input.force ||
    input.lastCheckedAt === null ||
    input.now - input.lastCheckedAt >= TEAM_REFRESH_FOCUS_THROTTLE_MS,
  );
}

export function teamPayloadFingerprint(payload: unknown): string {
  return JSON.stringify(payload, (key, value) => (key === "updatedAt" ? undefined : value));
}
