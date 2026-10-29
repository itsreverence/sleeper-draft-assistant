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
