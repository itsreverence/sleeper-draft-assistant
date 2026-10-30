import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capabilityToken = "private-http-capability-96c3f8";
const privatePathSegment = "private-codex-path-42b9d1";
const leagueId = "private-http-league-63e8a2";
const playerName = "Private Ranking Player 71c9";
const unmatchedName = "Private Unmatched Import 85d2";
const headers = { Authorization: `Bearer ${capabilityToken}` };

describe("composed API response redaction", () => {
  let directory: string;
  let codexBin: string;
  let app: typeof import("./index")["app"];

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "sda-http-private-"));
    codexBin = path.join(directory, privatePathSegment, "codex");
    vi.stubEnv("SLEEPER_AI_DATA_DIR", directory);
    vi.stubEnv("SLEEPER_AI_API_TOKEN", capabilityToken);
    vi.stubEnv("SLEEPER_AI_TEST_ENFORCE_AUTH", "1");
    vi.stubEnv("SLEEPER_AI_PROVIDER", "codex-app-server");
    vi.stubEnv("CODEX_BIN", codexBin);
    vi.resetModules();
    const { SqliteAppDatabase } = await import("./sqlite-app-database");
    const openDatabase = SqliteAppDatabase.open.bind(SqliteAppDatabase);
    // Test mode uses a shared temporary database whose persisted settings override these environment defaults.
    vi.spyOn(SqliteAppDatabase, "open").mockImplementation((filePath, options) =>
      openDatabase(filePath ?? path.join(directory, "app.sqlite"), options),
    );
    ({ app } = await import("./index"));

    expect((await app.request("/settings")).status).toBe(401);
    const settings = await app.request("/settings", { headers });
    expect(settings.status).toBe(200);
    expect(await settings.json()).toMatchObject({ aiProvider: "codex-app-server", codexBin });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    rmSync(directory, { recursive: true, force: true });
  });

  it("omits the capability token and local paths from diagnostics HTTP text", async () => {
    const response = await app.request("/diagnostics", { headers });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      settings: { aiProvider: "codex-app-server", codexBinConfigured: true },
      storage: { settingsRecords: 1 },
      runtime: { packagedDataDir: true },
    });
    for (const privateValue of [capabilityToken, privatePathSegment, directory, codexBin]) {
      expect(body).not.toContain(privateValue);
    }
  });

  it("copies only news categories, counts and elapsed time into diagnostics and support reports", async () => {
    const { createPlayerNewsTool } = await import("./ai/player-news");
    const { AiProviderManager } = await import("./ai/provider-factory");
    const { tool } = createPlayerNewsTool(
      [{ playerId: "private-player", name: playerName, team: "BUF", position: "QB" }],
      async () => JSON.stringify({ summary: "private-summary", sources: [
        { title: "private-title", url: "https://www.nfl.com/injuries/?private-query", reportedAt: "2026-10-29" },
        { title: "private-title", url: "https://private.invalid/private-path", reportedAt: null },
      ] }),
      (diagnostic) => { vi.spyOn(AiProviderManager.prototype, "newsDiagnostics").mockReturnValue([diagnostic]); },
    );
    await tool.execute({ playerId: "private-player", topic: "injury" });
    for (const route of ["/diagnostics", "/data/support-report"]) {
      const response = await app.request(route, { headers });
      expect(response.status).toBe(200);
      const body = await response.text();
      const parsed = JSON.parse(body);
      expect((parsed.diagnostics ?? parsed).newsLookups).toEqual([{
        outcome: "invalid_source", elapsedMs: expect.any(Number),
        rejectedSources: { undated_listing: 1, rejected_host: 1 },
      }]);
      for (const value of [playerName, "private-player", "private-summary", "private-title", "private-query", "private.invalid", "private-path", capabilityToken, directory]) {
        expect(body).not.toContain(value);
      }
    }
  });

  it("includes only phase timing metadata in both diagnostic exports", async () => {
    const { AiProviderManager } = await import("./ai/provider-factory");
    vi.spyOn(AiProviderManager.prototype, "timingDiagnostics").mockReturnValue([
      { kind: "draft_question", queueMs: 10, modelMs: 20, toolMs: 30, newsMs: 25 },
    ]);
    for (const route of ["/diagnostics", "/data/support-report"]) {
      const response = await app.request(route, { headers });
      const payload = await response.json();
      expect((payload.diagnostics ?? payload).aiTimings).toEqual([
        { kind: "draft_question", queueMs: 10, modelMs: 20, toolMs: 30, newsMs: 25 },
      ]);
      expect(JSON.stringify(payload)).not.toMatch(/private-http|Private Ranking/);
    }
  });

  it("omits imported names, league identifiers, the capability token and local paths from support-report HTTP text", async () => {
    const responses = new Map<string, unknown>([
      ["/v1/draft/redaction-draft", {
        draft_id: "redaction-draft", league_id: leagueId, status: "pre_draft", type: "snake",
        season: "2026", settings: { teams: 2, rounds: 2 }, slot_to_roster_id: { "1": 1, "2": 2 },
      }],
      ["/v1/draft/redaction-draft/picks", []],
      ["/v1/draft/redaction-draft/traded_picks", []],
      [`/v1/league/${leagueId}`, {
        league_id: leagueId, name: "Synthetic private league", season: "2026", total_rosters: 2,
        scoring_settings: { rec: 1 }, roster_positions: ["QB", "BN"],
      }],
      [`/v1/league/${leagueId}/rosters`, [{ roster_id: 1 }, { roster_id: 2 }]],
      [`/v1/league/${leagueId}/users`, []],
      ["/v1/players/nfl", {
        "private-player": {
          player_id: "private-player", full_name: playerName, team: "BUF", position: "QB",
          fantasy_positions: ["QB"], sport: "nfl", status: "Active", search_rank: 1,
        },
      }],
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const pathname = new URL(String(input)).pathname;
      if (!responses.has(pathname)) throw new Error(`Unexpected test request ${pathname}`);
      return Response.json(responses.get(pathname));
    }));

    const imported = await app.request("/drafts/redaction-draft/rankings/import", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "fantasypros", scoring: "PPR",
        csvText: `RK,TIERS,PLAYER NAME,TEAM,POS\n1,1,${playerName},BUF,QB1\n2,1,${unmatchedName},BUF,QB2`,
      }),
    });
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({
      summary: { matched: 1, unmatched: [{ name: unmatchedName }] },
      state: { leagueId, players: [expect.objectContaining({ name: playerName, importedRank: 1 })] },
    });

    const response = await app.request("/data/support-report", { headers });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      diagnostics: {
        settings: { aiProvider: "codex-app-server", codexBinConfigured: true },
        storage: { rankingImportRecords: 1, decisionSnapshots: 1 },
      },
      decisionHistory: [expect.objectContaining({ trigger: "rankings-import" })],
    });
    for (const privateValue of [playerName, unmatchedName, leagueId, capabilityToken, privatePathSegment, directory, codexBin]) {
      expect(body).not.toContain(privateValue);
    }
  });

  it("omits a failing Sleeper upstream's private path and token from HTTP text", async () => {
    const privatePath = "/home/private-upstream-29a7/credentials.json";
    const upstreamToken = "private-upstream-token-34a1";
    const upstreamError = new TypeError(`Cannot read ${privatePath} with Bearer ${upstreamToken}`);
    const fetchMock = vi.fn().mockRejectedValue(upstreamError);
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/sleeper/connect?username=redaction-user&season=2026", { headers });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sleeper.app/v1/user/redaction-user", expect.any(Object),
    );
    expect(response.status).toBe(502);
    const body = await response.text();
    for (const privateValue of [privatePath, upstreamToken]) {
      expect(body).not.toContain(privateValue);
    }
    expect(JSON.parse(body)).toEqual({ error: "Could not reach Sleeper. Check your connection, then try again." });
  });
});
