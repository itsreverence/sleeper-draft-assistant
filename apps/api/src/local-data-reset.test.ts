import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import { LocalDataResetCoordinator } from "./local-data-reset";
import { importFantasyProsCsv, RankingImportStore } from "./rankings-import";
import { SettingsStore } from "./settings-store";
import { writePrivateFile } from "./secure-file";
import { SqliteAppDatabase } from "./sqlite-app-database";

describe("LocalDataResetCoordinator", () => {
  it("restores database and store state when durable reset fails", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-reset-failure-"));
    const dbPath = path.join(dir, "app.sqlite");
    const settingsPath = path.join(dir, "settings.json");
    let failWrites = false;
    const database = await SqliteAppDatabase.open(dbPath, {
      writeFile(filePath, data) {
        if (failWrites) throw new Error("simulated reset write failure");
        writePrivateFile(filePath, data);
      },
    });
    let settingsStore = new SettingsStore(settingsPath, database);
    let rankingStore = new RankingImportStore(path.join(dir, "rankings.json"), database);
    const draftState = createMockDraftState(0);
    rankingStore.set(draftState.id, importFantasyProsCsv(
      draftState,
      '"RK",TIERS,"PLAYER NAME",TEAM,"POS"\n"1",1,"Jahmyr Gibbs",DET,"RB1"',
    ));
    settingsStore.update({ codexModel: "gpt-5.6-sol" });
    let providerCloseCount = 0;
    const coordinator = new LocalDataResetCoordinator({
      database,
      getResetTargets: () => ({
        clearers: [() => rankingStore.clearAll()],
        settingsStore,
      }),
      restoreStores: () => {
        settingsStore = new SettingsStore(settingsPath, database);
        rankingStore = new RankingImportStore(path.join(dir, "rankings.json"), database);
      },
      closeActiveProvider: () => {
        providerCloseCount += 1;
      },
    });
    const generationBeforeReset = coordinator.captureGeneration();

    failWrites = true;
    expect(() => coordinator.reset()).toThrow("simulated reset write failure");

    expect(coordinator.isCurrent(generationBeforeReset)).toBe(false);
    expect(providerCloseCount).toBe(1);
    expect(settingsStore.get().codexModel).toBe("gpt-5.6-sol");
    expect(rankingStore.get(draftState.id)).not.toBeNull();
    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.getJson("settings", "app")).toEqual(expect.objectContaining({ codexModel: "gpt-5.6-sol" }));
    expect(reopened.countJson("ranking_imports")).toBe(1);
  });

  it("refuses a persistence callback captured before reset", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-reset-generation-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    let settingsStore = new SettingsStore(path.join(dir, "settings.json"), database);
    const coordinator = new LocalDataResetCoordinator({
      database,
      getResetTargets: () => ({ clearers: [], settingsStore }),
      restoreStores: () => {
        settingsStore = new SettingsStore(path.join(dir, "settings.json"), database);
      },
      closeActiveProvider: () => undefined,
    });
    const requestGeneration = coordinator.captureGeneration();
    let finishProvider!: () => void;
    const providerTurn = new Promise<void>((resolve) => {
      finishProvider = resolve;
    });
    const completion = providerTurn.then(() => coordinator.commitIfCurrent(requestGeneration, () => {
      database.setJson("draft_plans", "draft-1:team-1", { shouldNotPersist: true });
    }));

    coordinator.reset();
    finishProvider();

    expect(await completion).toBe(false);
    expect(database.countJson("draft_plans")).toBe(0);
  });

  it("clears one logical reset with one durable replacement", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-reset-success-"));
    const dbPath = path.join(dir, "app.sqlite");
    let writes = 0;
    const database = await SqliteAppDatabase.open(dbPath, {
      writeFile(filePath, data) {
        writes += 1;
        writePrivateFile(filePath, data);
      },
    });
    let settingsStore = new SettingsStore(path.join(dir, "settings.json"), database);
    settingsStore.update({ codexModel: "gpt-5.6-sol" });
    database.setJson("ranking_imports", "draft-1", { private: true });
    database.setJson("weekly_projection_imports", "league-1:2026:1", { private: true });
    const coordinator = new LocalDataResetCoordinator({
      database,
      getResetTargets: () => ({
        clearers: [
          () => database.clearJson("ranking_imports"),
          () => database.clearJson("weekly_projection_imports"),
        ],
        settingsStore,
      }),
      restoreStores: () => {
        settingsStore = new SettingsStore(path.join(dir, "settings.json"), database);
      },
      closeActiveProvider: () => undefined,
    });
    writes = 0;

    const settings = coordinator.reset();

    expect(writes).toBe(1);
    expect(settings.codexModel).not.toBe("gpt-5.6-sol");
    expect(database.countJson("ranking_imports")).toBe(0);
    expect(database.countJson("weekly_projection_imports")).toBe(0);
    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.countJson("ranking_imports")).toBe(0);
    expect(reopened.countJson("weekly_projection_imports")).toBe(0);
    expect(reopened.getJson("settings", "app")).toEqual(settings);
  });
});
