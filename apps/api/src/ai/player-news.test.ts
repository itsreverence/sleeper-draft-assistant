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
    // Search domain filters may include subdomains that citation validation rejects.
    expect(lookup.mock.calls[0]?.[0]).toContain("exact HTTPS hosts: nfl.com, www.nfl.com, amp.nfl.com, espn.com, www.espn.com");
    expect(lookup.mock.calls[0]?.[0]).toContain("Do not rewrite a URL");
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

  it("accepts dated articles on the official NFL AMP host", async () => {
    const news = createPlayerNewsTool(players, async () => response.replace("www.nfl.com", "amp.nfl.com"));
    expect(await news.tool.execute({ playerId: "private-id", topic: "practice" })).toMatchObject({ status: "available" });
    expect(news.sources[0]?.url).toBe("https://amp.nfl.com/news/report");
  });

  it.each(["javascript:alert(1)", "https://www.nfl.com.evil.test/report", "https://amp.nfl.com.evil.test/report", "https://unknown.nfl.com/report", "https://fantasy-www.nfl.com/report", "https://user:secret@nfl.com/report", "http://nfl.com/report", "https://127.0.0.1/report"])("rejects unsafe source %s", async (url) => {
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "News", sources: [{ title: "Report", url, reportedAt: "2026-09-24" }] }), record);
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "unavailable" });
    expect(news.sources).toEqual([]);
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome: "invalid_source", elapsedMs: 0, rejectedSources: expect.any(Object) });
  });

  it.each([
    { title: "Undated", url: "https://nfl.com/news/undated", reportedAt: null },
    { title: "Stale", url: "https://nfl.com/news/stale", reportedAt: "2026-09-16" },
    { title: "Future", url: "https://nfl.com/news/future", reportedAt: "2026-09-25" },
    { title: "Invalid day", url: "https://nfl.com/news/invalid", reportedAt: "2026-02-31" },
    { title: "Malformed date", url: "https://nfl.com/news/malformed", reportedAt: "yesterday" },
    { title: "Unsafe host", url: "https://evil.test/report", reportedAt: "2026-09-24" },
    { title: "Malformed source" },
  ])("keeps a verified source when another source is unusable: $title", async (unusable) => {
    const valid = JSON.parse(response).sources[0];
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "Reporting is uncertain.", sources: [unusable, valid] }), record);
    const result = await news.tool.execute({ playerId: "private-id", topic: "injury" });
    expect(result).toMatchObject({ status: "available", sources: [{ ...valid, checkedAt: "2026-09-24T12:00:00.000Z" }] });
    expect(news.sources).toEqual([{ ...valid, checkedAt: "2026-09-24T12:00:00.000Z" }]);
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome: "available", elapsedMs: 0, rejectedSources: expect.any(Object) });
  });

  it("accepts the inclusive seven-day boundary and drops older sources", async () => {
    const valid = { title: "Last week", url: "https://espn.com/nfl/story", reportedAt: "2026-09-17" };
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "Report", sources: [valid, { ...valid, reportedAt: "2026-09-16" }] }));
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "available", sources: [{ ...valid, checkedAt: expect.any(String) }] });
  });

  it("returns a safe gap instead of exposing provider errors", async () => {
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => {
      vi.setSystemTime(Date.now() + 250);
      throw Error("private config path");
    }, record);
    const result = await news.tool.execute({ playerId: "private-id", topic: "role" });
    expect(result).toMatchObject({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("private config");
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome: "provider_error", elapsedMs: 250, rejectedSources: expect.any(Object) });
  });

  it.each([
    ["not JSON", "invalid_json"],
    [JSON.stringify({ summary: "No recent articles", sources: [] }), "no_sources_returned"],
    [JSON.stringify({ summary: "News", sources: [{ title: "Report", url: "https://evil.test/private", reportedAt: "2026-09-24" }] }), "invalid_source"],
    [JSON.stringify({ summary: "News", sources: [{ title: "Report", url: "https://nfl.com/news/report", reportedAt: null }] }), "invalid_date"],
    [JSON.stringify({ sources: [] }), "invalid_response"],
    [response, "available"],
  ])("records a bounded category for %s", async (raw, outcome) => {
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => raw, record);
    await news.tool.execute({ playerId: "private-id", topic: "injury" });
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome, elapsedMs: 0, rejectedSources: expect.any(Object) });
  });

  it.each([null, "2025-11-16", "2026-09-25", "2026-02-31"])("does not present an old, unknown, future, or invalid date as current: %s", async (reportedAt) => {
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "News", sources: [{ title: "Report", url: "https://www.nfl.com/news/report", reportedAt }] }));
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "unavailable" });
    expect(news.sources).toHaveLength(0);
  });
  it.each([
    [null, "missing_date"], [undefined, "missing_date"], ["yesterday", "malformed_date"],
    ["2026-02-31", "malformed_date"], ["2026-09-25", "future_date"], ["2026-09-16", "stale_date"],
  ])("counts date rejection %s without retaining source content", async (reportedAt, reason) => {
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "Private summary", sources: [
      { title: "Private title", url: "https://nfl.com/news/private", reportedAt },
    ] }), record);
    await news.tool.execute({ playerId: "private-id", topic: "injury" });
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome: "invalid_date", elapsedMs: 0, rejectedSources: { [reason]: 1 } });
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/private|Private|https/);
  });

  it("counts each rejected source once and retains a valid article", async () => {
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "News", sources: [
      { title: "Listing", url: "https://amp.nfl.com/injuries/", reportedAt: "2026-09-24" },
      { title: "Bad host", url: "https://www.49ers.com.evil.test/news/report", reportedAt: "2026-09-24" },
      JSON.parse(response).sources[0],
    ] }), record);
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "available" });
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome: "available", elapsedMs: 0, rejectedSources: { undated_listing: 1, rejected_host: 1 } });
  });

  it("bounds invalid shape counts to the three-source limit", async () => {
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "News", sources: [null, 42, {}] }), record);
    await news.tool.execute({ playerId: "private-id", topic: "injury" });
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome: "invalid_source", elapsedMs: 0, rejectedSources: { invalid_source_shape: 3 } });
  });

  it.each([
    "https://www.nfl.com/news/nfl-week-8-injury-report-2026-season",
    "https://www.49ers.com/news/week-8-injury-report",
    "https://www.raiders.com/news/roster-moves",
    "https://www.espn.com/nfl/story/_/id/123/depth-charts",
    "https://www.nbcsports.com/nfl/news/dated-report",
    "https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/dated-report",
    "https://www.nbcsports.com/fantasy/football/player-news/2026-09-24/dated-report",
  ])("admits dated articles alongside rolling route rejections: %s", async (url) => {
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "Report", sources: [{ title: "Report", url, reportedAt: "2026-09-24" }] }));
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "available", sources: [{ url }] });
  });

  it.each([
    "https://www.nbcsports.com/nfl/a-j-brown/6477",
    "https://www.nbcsports.com/nfl/a-j-brown/6477/news/",
    "https://www.nbcsports.com/nfl/a-j-brown/6477/stats",
    "https://www.nbcsports.com/nfl/profootballtalk/rumor-mill",
    "https://www.nfl.com/players/patrick-mahomes/",
    "https://www.nfl.com/teams/kansas-city-chiefs/roster",
    "https://www.nfl.com/teams/kansas-city-chiefs/depth-chart",
    "https://www.nfl.com/teams/kansas-city-chiefs/injuries",
    "https://www.espn.com/nfl/team/roster/_/name/kc",
    "https://www.espn.com/nfl/team/depth/_/name/kc",
    "https://www.espn.com/nfl/team/injuries/_/name/kc",
    "https://www.espn.com/nfl/players",
    "https://amp.nfl.com/injuries/", "https://www.nfl.com/injuries/?team=min",
    "https://www.nfl.com/transactions/league/reserve-list/2026/10?after=cursor",
    "https://www.49ers.com/team/injury-report", "https://www.philadelphiaeagles.com/team/roster/",
    "https://www.seahawks.com/team/depth-chart", "https://www.49ers.com/roster", "https://www.49ers.com/team/players-roster/test-player/",
    "https://www.philadelphiaeagles.com/team/app-injury-report/",
    "https://www.49ers.com/team/transactions/2026", "https://www.49ers.com/team/%69njury-report",
    "https://www.espn.com/nfl/player/_/id/123/test-player", "https://www.espn.com/nfl/player/gamelog/_/id/123",
    "https://www.nbcsports.com/fantasy/football/player-news", "https://www.nbcsports.com/nfl/players/123/test",
  ])("rejects rolling listing even with a plausible date: %s", async (url) => {
    const record = vi.fn();
    const news = createPlayerNewsTool(players, async () => JSON.stringify({ summary: "News", sources: [{ title: "Report", url, reportedAt: "2026-09-24" }] }), record);
    expect(await news.tool.execute({ playerId: "private-id", topic: "injury" })).toMatchObject({ status: "unavailable" });
    expect(record).toHaveBeenCalledExactlyOnceWith({ outcome: "invalid_source", elapsedMs: 0, rejectedSources: { undated_listing: 1 } });
  });
});
