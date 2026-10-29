import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@sleeper-draft-assistant/shared";
const fixturePlayer: Player = { id: "synthetic", sleeperId: "synthetic", name: "Synthetic Player", team: "ARI", position: "QB", projectedPoints: 0, projectionSource: "mock", adp: null, tier: null, riskTags: [] };
import { applyPlayerSchedule, NflScheduleSchema } from "./nfl-schedule";
import { SleeperClient } from "./sleeper";
import { syntheticSchedule } from "./testing/schedule-fixture";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("NFL schedule facts", () => {
  it("validates a full synthetic season and rejects partial, duplicate and malformed responses", () => {
    expect(NflScheduleSchema.safeParse(syntheticSchedule).success).toBe(true);
    for (const invalid of [[], syntheticSchedule.slice(1), [...syntheticSchedule.slice(1), syntheticSchedule[1]], syntheticSchedule.map((g) => ({ ...g, home: "XXX" })), syntheticSchedule.map((g) => ({ ...g, date: "bad" }))]) {
      expect(NflScheduleSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("maps unfamiliar bounded status strings to unknown without losing schedule facts", () => {
    const schedule = NflScheduleSchema.parse(syntheticSchedule.map((game) => ({ ...game, status: "in_game" })));
    expect(applyPlayerSchedule(fixturePlayer, schedule, "2026", 1).schedule).toMatchObject({ gameStatus: "unknown", onBye: false, opponent: "ATL" });
    for (const status of [null, 3, "", "x".repeat(81)]) {
      expect(NflScheduleSchema.safeParse(syntheticSchedule.map((game) => ({ ...game, status }))).success).toBe(false);
    }
  });

  it.each(["FA", "", "XXX"])("does not reuse imported byes for team %s", (team) => {
    for (const schedule of [syntheticSchedule, null]) {
      const result = applyPlayerSchedule({ ...fixturePlayer, team, byeWeek: 7 }, schedule, "2026", 7);
      expect(result.byeWeek).toBeNull();
      expect(result.schedule).toMatchObject({ onBye: null, source: "unknown", opponent: null });
    }
  });

  it("retries unavailable schedules after two minutes", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockImplementation(() => Promise.resolve(Response.json(syntheticSchedule)));
    vi.stubGlobal("fetch", fetch);
    const client = new SleeperClient();
    expect(await client.getNflSchedule("2026")).toBeNull();
    expect(await client.getNflSchedule("2026")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(await client.getNflSchedule("2026")).toEqual(syntheticSchedule);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts a hung schedule request within 2.5 seconds without retries", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetch);
    const pending = new SleeperClient().getNflSchedule("2026");
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses week numbers for all 18 weeks, regardless of Thursday or international game dates", () => {
    const player = { ...fixturePlayer, team: "ARI", byeWeek: 3 };
    for (let week = 1; week <= 18; week++) {
      const facts = applyPlayerSchedule(player, syntheticSchedule, "2026", week);
      expect(facts.byeWeek).toBe(9);
      expect(facts.schedule?.onBye).toBe(week === 9);
      expect(facts.schedule?.opponent).toBe(week === 9 ? null : "ATL");
      expect(facts.schedule?.homeAway).toBe(week === 9 ? null : "home");
      expect(facts.schedule?.gameStatus).toBe(week === 9 ? null : "pre_game");
    }
  });

  it("preserves away-team facts for an international Sunday pairing", () => {
    expect(applyPlayerSchedule({ ...fixturePlayer, team: "BUF" }, syntheticSchedule, "2026", 6).schedule)
      .toMatchObject({ opponent: "BAL", homeAway: "away", onBye: false, gameStatus: "pre_game" });
  });

  it("contains upstream failures without returning private errors", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("private upstream body", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    expect(await new SleeperClient().getNflSchedule("2026")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes after six hours and does not restore cleared in-flight results", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }))
      .mockImplementation(() => Promise.resolve(Response.json(syntheticSchedule)));
    vi.stubGlobal("fetch", fetch);
    const client = new SleeperClient();
    const pending = client.getNflSchedule("2026");
    client.clearScheduleCache();
    resolve(Response.json(syntheticSchedule));
    await pending;
    await client.getNflSchedule("2026");
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000);
    await client.getNflSchedule("2026");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("falls back to imported byes then unknown, including free agents and inactive weeks", () => {
    const player = fixturePlayer;
    expect(applyPlayerSchedule({ ...player, byeWeek: 7 }, null, "2026", 7).schedule).toMatchObject({ onBye: true, source: "draft_import" });
    expect(applyPlayerSchedule({ ...player, byeWeek: null, team: "FA" }, syntheticSchedule, "2026", 7).schedule).toMatchObject({ onBye: null, source: "unknown" });
    expect(applyPlayerSchedule(player, syntheticSchedule, "2026", null).schedule?.onBye).toBeNull();
  });

  it("coalesces requests, caches failures safely, and clears for reset", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(syntheticSchedule)));
    vi.stubGlobal("fetch", fetch);
    const client = new SleeperClient();
    const [first, second] = await Promise.all([client.getNflSchedule("2026"), client.getNflSchedule("2026")]);
    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.sleeper.app/schedule/nfl/regular/2026");
    client.clearScheduleCache();
    fetch.mockResolvedValue(new Response('{"private":"upstream secret"}'));
    expect(await client.getNflSchedule("2026")).toBeNull();
    expect(await client.getNflSchedule("2026")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
