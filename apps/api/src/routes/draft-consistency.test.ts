import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import type { DraftState } from "@sleeper-draft-assistant/shared";
import { LocalDataResetCoordinator, LocalDataResetError } from "../local-data-reset";
import { createDraftRoutes } from "./draft-routes";

function fixture() {
  let state: DraftState = { ...createMockDraftState(8), status: "pre_draft" };
  let draft = { draft_id: "live", status: "pre_draft" };
  let picks: Array<{ pick_no: number; player_id: string }> = [];
  const record = vi.fn();
  const setImport = vi.fn();
  const createGuidance = vi.fn();
  const strategizeDraft = vi.fn();
  const reset = new LocalDataResetCoordinator({
    database: { batch: (action: () => unknown) => action() } as never,
    getResetTargets: () => ({ clearers: [], settingsStore: { reset: () => ({}) } as never }),
    restoreStores: () => {}, closeActiveProvider: () => {},
  });
  const getDraftState = vi.fn(async () => structuredClone(state));
  const identityStore = { apply: (_id: string, value: unknown) => value, get: () => null, set: setImport };
  const routes = createDraftRoutes({
    sleeperClient: {
      getDraft: async () => draft,
      getDraftPicks: async () => picks,
      getDraftState,
    } as never,
    aiProviderManager: { get: () => ({ status: () => ({ id: "noop" }), strategizeDraft }) } as never,
    appDatabase: {} as never,
    localDataReset: reset,
    getSettingsStore: () => ({ get: () => ({}) }) as never,
    getRankingImportStore: () => identityStore as never,
    getSeasonProjectionImportStore: () => identityStore as never,
    getAdpImportStore: () => identityStore as never,
    getDecisionLogStore: () => ({ record }) as never,
    getDraftPlanStore: () => ({ get: () => null }) as never,
    getDraftStrategyInstructionStore: () => ({ create: createGuidance, list: () => [] }) as never,
    handleRouteError: (c, error) => c.json({ error: "Request failed" }, error instanceof LocalDataResetError ? 409 : 500),
    logRouteErrorMessage: () => {},
  });
  const app = new Hono();
  routes.registerGuidanceRoutes(app);
  routes.registerWorkspaceRoutes(app);
  return { app, reset, record, setImport, createGuidance, getDraftState, strategizeDraft,
    change: () => {
      draft = { ...draft, status: "drafting" };
      state = { ...state, status: "drafting" };
    },
    correct: (playerId: string) => {
      picks = [{ pick_no: 1, player_id: playerId }];
      state = { ...state, picks: [{ pickNo: 1, round: 1, draftSlot: 1, teamId: state.teams[0]!.id, playerId }], currentPick: 2 };
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("draft request consistency", () => {
  it("rejects an AI strategy if a pick is replaced without advancing the pick number", async () => {
    const f = fixture();
    f.correct("first-player");
    let release!: (value: unknown) => void;
    f.strategizeDraft.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const request = f.app.request("/drafts/live/strategy", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    await vi.waitFor(() => expect(f.strategizeDraft).toHaveBeenCalled());
    f.correct("replacement-player");
    release({});
    expect((await request).status).toBe(409);
    expect(f.record).not.toHaveBeenCalled();
  });

  it("publishes status-only changes and same-count corrections as snapshots", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const response = await f.app.request("/drafts/live/events");
    const reader = response.body!.getReader();
    const read = async () => new TextDecoder().decode((await reader.read()).value);
    expect(await read()).toContain("event: snapshot");
    f.change();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await read()).toContain('"status":"drafting"');
    f.correct("first-player");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await read()).toContain('"playerId":"first-player"');
    f.correct("replacement-player");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await read()).toContain('"playerId":"replacement-player"');
    await reader.cancel();
    const calls = f.getDraftState.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.getDraftState).toHaveBeenCalledTimes(calls);
  });

  it("backs off repeated full rebuild failures even when lightweight polling succeeds", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const reader = (await f.app.request("/drafts/live/events")).body!.getReader();
    await reader.read();
    f.change();
    f.getDraftState.mockRejectedValue(new Error("upstream failed"));
    for (const [delay, retry] of [[5_000, 5_000], [5_000, 10_000], [10_000, 20_000]]) {
      await vi.advanceTimersByTimeAsync(delay!);
      const event = new TextDecoder().decode((await reader.read()).value);
      expect(event).toContain(`"nextRetryMs":${retry}`);
    }
    await reader.cancel();
  });

  it("retries publishing a changed snapshot when its history save fails", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const reader = (await f.app.request("/drafts/live/events")).body!.getReader();
    await reader.read();
    f.change();
    f.record.mockImplementationOnce(() => { throw new Error("disk full"); });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: stream-error");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"status":"drafting"');
    await reader.cancel();
  });

  it("stops an old stream after reset without recording another snapshot", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const reader = (await f.app.request("/drafts/live/events")).body!.getReader();
    await reader.read();
    f.reset.reset();
    f.correct("late-player");
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await reader.read()).done).toBe(true);
    expect(f.record).not.toHaveBeenCalled();
  });

  it.each(["state", "rankings/import", "strategy-instructions"])("rejects a pending %s request after reset", async (route) => {
    const f = fixture();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    f.getDraftState.mockImplementationOnce(async () => {
      await pending;
      return createMockDraftState(8);
    });
    const request = f.app.request(`/drafts/live/${route}`, route === "state" ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(route === "strategy-instructions"
        ? { scope: "next-pick", text: "Prefer a receiver" }
        : { source: "fantasypros", scoring: "PPR", csvText: "RK,PLAYER NAME,TEAM,POS\n1,Josh Allen,BUF,QB1" }),
    });
    await vi.waitFor(() => expect(f.getDraftState).toHaveBeenCalled());
    f.reset.reset();
    release();
    expect((await request).status).toBe(409);
    expect(f.record).not.toHaveBeenCalled();
    expect(f.setImport).not.toHaveBeenCalled();
    expect(f.createGuidance).not.toHaveBeenCalled();
  });
});
