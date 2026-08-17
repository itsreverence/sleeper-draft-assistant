import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildDraftRecommendation, createMockDraftState } from "@sleeper-draft-assistant/engine";
import type { AppSettings } from "@sleeper-draft-assistant/shared";
import { describe, expect, it } from "vitest";

import { buildRedactedSupportReport, buildStorageInventory } from "./data-management";
import { DecisionLogStore } from "./decision-log-store";
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
    const state = {
      ...createMockDraftState(11),
      id: "sensitive-draft-id",
      leagueId: "sensitive-league-id",
      name: "Private home league",
      userTeamId: "sensitive-team-id",
      currentPick: 12,
    };
    const recommendation = buildDraftRecommendation(state);
    const store = new DecisionLogStore(path.join(dir, "legacy.json"), 200, database);
    store.record({
      draftId: state.id,
      state,
      recommendation: {
        ...recommendation,
        headline: "Draft Sensitive Player",
        assumptions: ["private assumption"],
        risks: ["private risk"],
      },
      trigger: "ai-question",
      userRosterId: "sensitive-roster-id",
    });
    const settings: AppSettings = {
      aiProvider: "codex-app-server",
      codexBin: "C:\\Users\\private\\bin\\codex.exe",
      codexModel: "gpt-5.4",
      codexServiceTier: "fast",
      codexTimeoutMs: 60000,
      automaticAiAudit: "off",
      aiSetupAcknowledged: true,
    };

    const report = buildRedactedSupportReport({
      diagnostics: { ok: true, settings: { codexBinConfigured: true } },
      database,
      settings,
    });
    const serialized = JSON.stringify(report);

    expect(report.provider.serviceTier).toBe("fast");
    expect(report.decisionHistory).toEqual([
      expect.objectContaining({
        trigger: "ai-question",
        currentPick: 12,
        candidateCount: recommendation.candidates.length,
        assumptionCount: 1,
        riskCount: 1,
      }),
    ]);
    for (const sensitiveValue of [
      "sensitive-draft-id",
      "sensitive-league-id",
      "sensitive-roster-id",
      "Private home league",
      "Sensitive Player",
      "C:\\Users\\private",
      "private assumption",
      "private risk",
    ]) {
      expect(serialized).not.toContain(sensitiveValue);
    }
  });
});
