import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerNewsTool } from "./player-news";

const players = [{ playerId: "private-id", name: "Test Player", team: "SEA", position: "RB" }];
const response = JSON.stringify({ summary: "A report, not a lineup decision.", sources: [{ title: "Practice report", url: "https://www.nfl.com/news/report", reportedAt: "2026-09-24" }] });

describe("bounded public player news", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-24T12:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("sends only public identity, preserves citations, and limits lookups", async () => {
    const lookup = vi.fn(async (_prompt: string) => response);
    const news = createPlayerNewsTool(players, lookup);
    const args = { playerId: "private-id", topic: "practice" };
    expect(await news.tool.execute(args)).toMatchObject({ status: "available" });
    expect(lookup.mock.calls[0]?.[0]).not.toContain("private-id");
    expect(lookup.mock.calls[0]?.[0]).toContain("Test Player");
    expect(news.sources[0]).toMatchObject({ reportedAt: "2026-09-24", checkedAt: expect.any(String) });
    await news.tool.execute(args);
    expect(await news.tool.execute(args)).toMatchObject({ status: "unavailable" });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("rejects arbitrary queries and players outside the snapshot before lookup", async () => {
    const lookup = vi.fn(async () => response);
    const { tool } = createPlayerNewsTool(players, lookup);
    await expect(tool.execute({ playerId: "unknown", topic: "injury" })).rejects.toThrow();
    await expect(tool.execute({ playerId: "private-id", topic: "injury", query: "private league data" })).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "https://www.nfl.com.evil.test/report", "https://user:secret@nfl.com/report", "http://nfl.com/report", "https://127.0.0.1/report"])("rejects unsafe source %s", async (url) => {
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "News", sources: [{ title: "Report", url, reportedAt: null }] }));
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "unavailable" });
    expect(news.sources).toEqual([]);
  });

  it("returns a safe gap instead of exposing provider errors", async () => {
    const news = createPlayerNewsTool(players, async () => { throw Error("private config path"); });
    const result = await news.tool.execute({ playerId: "private-id", topic: "role" });
    expect(result).toMatchObject({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("private config");
  });

  it.each([null, "2025-11-16", "2026-09-25", "2026-02-31"])("does not present an old, unknown, future, or invalid date as current: %s", async (reportedAt) => {
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "News", sources: [{ title: "Report", url: "https://www.nfl.com/news/report", reportedAt }] }));
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "unavailable" });
    expect(news.sources).toHaveLength(0);
  });
});
