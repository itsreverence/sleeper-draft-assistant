import { describe, expect, it } from "vitest";

import {
  normalizeTeamProjectionOverride,
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

  it("detects Sleeper player-status changes even when the roster is unchanged", () => {
    const healthy = {
      state: {
        roster: [{ id: "player-1", sleeperStatus: { injuryStatus: null } }],
        updatedAt: "2026-08-29T10:00:00.000Z",
      },
    };
    const questionable = {
      state: {
        roster: [{ id: "player-1", sleeperStatus: { injuryStatus: "Questionable" } }],
        updatedAt: "2026-08-29T10:01:00.000Z",
      },
    };

    expect(teamPayloadFingerprint(questionable)).not.toBe(teamPayloadFingerprint(healthy));
  });

  it("follows Sleeper after an explicit projection week becomes the active week", () => {
    expect(normalizeTeamProjectionOverride({
      season: "2026",
      week: 1,
      activeSeason: "2026",
      activeWeek: null,
    })).toEqual({ season: "2026", week: 1 });

    expect(normalizeTeamProjectionOverride({
      season: "2026",
      week: 1,
      activeSeason: "2026",
      activeWeek: 1,
    })).toEqual({ season: "", week: 0 });

    expect(normalizeTeamProjectionOverride({
      season: "2026",
      week: 1,
      activeSeason: "2026",
      activeWeek: 2,
    })).toEqual({ season: "2026", week: 1 });
  });
});
