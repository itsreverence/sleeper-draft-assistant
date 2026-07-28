import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AppSettings } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { buildRedactedSupportReport, buildStorageInventory } from "./data-management";
import { SqliteAppDatabase } from "./sqlite-app-database";

describe("local data management", () => {
  it("reports aggregate storage counts without record keys", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-storage-inventory-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    database.setJson("ranking_imports", "sensitive-draft-id", { player: "Sensitive Player" });
    database.setJson("weekly_projection_imports", "sensitive-league-id:2025:1", { points: 20 });

    const inventory = buildStorageInventory(database);

    expect(inventory.rankingImports).toBe(1);
    expect(inventory.weeklyProjectionImports).toBe(1);
    expect(JSON.stringify(inventory)).not.toContain("sensitive-draft-id");
    expect(JSON.stringify(inventory)).not.toContain("sensitive-league-id");
  });

  it("redacts identifiers, names, headlines, values, and executable paths from support history", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-support-report-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    database.insertDecisionSnapshot({
      id: "sensitive-snapshot-id",
      draftId: "sensitive-draft-id",
      createdAt: "2026-07-28T12:00:00.000Z",
      trigger: "ai-question",
      value: {
        id: "sensitive-snapshot-id",
        draftId: "sensitive-draft-id",
        leagueId: "sensitive-league-id",
        userRosterId: "sensitive-roster-id",
        trigger: "ai-question",
        createdAt: "2026-07-28T12:00:00.000Z",
        draftName: "Private home league",
        status: "drafting",
        currentPick: 12,
        picksMade: 11,
        userTeamId: "sensitive-team-id",
        userTeamName: "Private team",
        recommendedPlayerId: "player-1",
        headline: "Draft Sensitive Player",
        confidence: "high",
        candidatePlayerIds: ["player-1", "player-2"],
        recommendation: { secretProjection: 321.45 },
        context: {
          topCandidates: [{ name: "Sensitive Player" }],
          assumptions: ["private assumption"],
          risks: ["private risk"],
        },
      },
    });
    const settings: AppSettings = {
      aiProvider: "codex-app-server",
      codexBin: "C:\\Users\\private\\bin\\codex.exe",
      codexModel: "gpt-5.4",
      codexTimeoutMs: 60000,
    };

    const report = buildRedactedSupportReport({
      diagnostics: { ok: true, settings: { codexBinConfigured: true } },
      database,
      settings,
    });
    const serialized = JSON.stringify(report);

    expect(report.decisionHistory).toEqual([
      expect.objectContaining({
        trigger: "ai-question",
        currentPick: 12,
        candidateCount: 2,
        assumptionCount: 1,
        riskCount: 1,
      }),
    ]);
    for (const sensitiveValue of [
      "sensitive-snapshot-id",
      "sensitive-draft-id",
      "sensitive-league-id",
      "sensitive-roster-id",
      "Private home league",
      "Private team",
      "Sensitive Player",
      "321.45",
      "C:\\Users\\private",
      "private assumption",
      "private risk",
    ]) {
      expect(serialized).not.toContain(sensitiveValue);
    }
  });
});
