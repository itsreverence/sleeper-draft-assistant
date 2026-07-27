import { describe, expect, it } from "vitest";

import {
  shouldRefreshTeamManager,
  TEAM_REFRESH_FOCUS_THROTTLE_MS,
  teamPayloadFingerprint,
} from "./team-refresh";

describe("Team Manager refresh", () => {
  it("refreshes only while the visible Team Manager is active", () => {
    const baseline = {
      workspaceMode: "manage" as const,
      manageAvailable: true,
      visibilityState: "visible" as const,
      isRefreshing: false,
      lastCheckedAt: null,
      now: 20_000,
    };

    expect(shouldRefreshTeamManager(baseline)).toBe(true);
    expect(shouldRefreshTeamManager({ ...baseline, workspaceMode: "draft" })).toBe(false);
    expect(shouldRefreshTeamManager({ ...baseline, visibilityState: "hidden" })).toBe(false);
    expect(shouldRefreshTeamManager({ ...baseline, isRefreshing: true })).toBe(false);
  });

  it("throttles focus refreshes while allowing manual refresh", () => {
    const input = {
      workspaceMode: "manage" as const,
      manageAvailable: true,
      visibilityState: "visible" as const,
      isRefreshing: false,
      lastCheckedAt: 20_000,
      now: 20_000 + TEAM_REFRESH_FOCUS_THROTTLE_MS - 1,
    };

    expect(shouldRefreshTeamManager(input)).toBe(false);
    expect(shouldRefreshTeamManager({ ...input, force: true })).toBe(true);
  });

  it("ignores generated timestamps when detecting meaningful changes", () => {
    const first = {
      state: { roster: ["player-1"], updatedAt: "2026-07-27T10:00:00.000Z" },
      activity: { transactions: [], updatedAt: "2026-07-27T10:00:00.000Z" },
    };
    const checkedAgain = {
      state: { roster: ["player-1"], updatedAt: "2026-07-27T10:01:00.000Z" },
      activity: { transactions: [], updatedAt: "2026-07-27T10:01:00.000Z" },
    };
    const changed = {
      ...checkedAgain,
      state: { roster: ["player-1", "player-2"], updatedAt: "2026-07-27T10:02:00.000Z" },
    };

    expect(teamPayloadFingerprint(checkedAgain)).toBe(teamPayloadFingerprint(first));
    expect(teamPayloadFingerprint(changed)).not.toBe(teamPayloadFingerprint(first));
  });
});
