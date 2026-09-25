import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMockDraftState } from "@sleeper-draft-assistant/engine";
import { describe, expect, it } from "vitest";

import { AdpImportStore, SeasonProjectionImportStore, importFantasyProsAdpCsv, importFantasyProsSeasonProjectionCsvs } from "./draft-value-import";
import { RankingImportStore, importFantasyProsCsv } from "./rankings-import";
import { SeasonValueRankingImportStore, importFantasyProsSeasonValueRankings } from "./ros-rankings-import";
import { WeeklyProjectionImportStore, importFantasyProsWeeklyProjectionCsv } from "./weekly-projections-import";
import { SettingsStore } from "./settings-store";
import { CommittedFileWriteError, writePrivateFile } from "./secure-file";
import { SqliteAppDatabase } from "./sqlite-app-database";

const state = createMockDraftState(0);
const rankingCsv = 'RK,TIERS,PLAYER NAME,TEAM,POS,BYE WEEK,ECR VS. ADP\n1,1,Jahmyr Gibbs,DET,RB1,8,-';
const projectionCsv = 'Player,Team,ATT,YDS,TDS,REC,YDS,TDS,FL,FPTS\nJahmyr Gibbs,DET,18,80,1,4,30,0,0,21';
const factories = {
  rankings: (file: string, db: SqliteAppDatabase) => bindStore(new RankingImportStore(file, db), state.id, importFantasyProsCsv(state, rankingCsv)),
  season: (file: string, db: SqliteAppDatabase) => bindStore(new SeasonProjectionImportStore(file, db), state.id,
    importFantasyProsSeasonProjectionCsvs({ state, season: "2026", files: [{ position: "RB", csvText: projectionCsv }] })),
  adp: (file: string, db: SqliteAppDatabase) => bindStore(new AdpImportStore(file, db), state.id,
    importFantasyProsAdpCsv({ state, season: "2026", csvText: 'Rank,Player (Bye),POS,Sleeper,RTSports,AVG,Real-Time\n1,Jahmyr Gibbs DET (8),RB1,2,-,2,1' })),
  weekly: (file: string, db: SqliteAppDatabase) => bindStore(new WeeklyProjectionImportStore(file, db), { leagueId: "test", season: "2026", week: 1 },
    importFantasyProsWeeklyProjectionCsv({ players: state.players, leagueId: "test", season: "2026", week: 1, csvText: projectionCsv })),
  seasonValue: (file: string, db: SqliteAppDatabase) => bindStore(new SeasonValueRankingImportStore(file, db), { leagueId: "test", season: "2026", scoring: "PPR" },
    importFantasyProsSeasonValueRankings({ players: state.players, season: "2026", scoring: "PPR", csvText: rankingCsv })),
};

function bindStore<K, T>(store: { get(key: K): T | null; set(key: K, value: T): void; delete(key: K): boolean; clearAll(): number }, key: K, value: T) {
  return { get: () => store.get(key), set: () => store.set(key, value), delete: () => store.delete(key), clearAll: () => store.clearAll() };
}

describe("storage failure consistency", () => {
  for (const [name, createStore] of Object.entries(factories)) {
    it(`${name} keeps cache and reopened database aligned across failed saves and clears`, async () => {
      const directory = mkdtempSync(path.join(tmpdir(), "sda-store-failure-"));
      const dbPath = path.join(directory, "app.sqlite");
      const file = path.join(directory, "legacy.json");
      let failure: "before" | "after" | null = null;
      const database = await SqliteAppDatabase.open(dbPath, { writeFile(filePath, bytes) {
        if (failure === "before") throw new Error("disk full");
        writePrivateFile(filePath, bytes);
        if (failure === "after") throw new CommittedFileWriteError(new Error("directory sync failed"));
      } });
      const store = createStore(file, database);
      failure = "before";
      expect(store.set).toThrow("disk full");
      expect(store.get()).toBeNull();
      failure = null;
      store.set();
      const saved = store.get();
      failure = "before";
      expect(store.delete).toThrow("disk full");
      expect(store.clearAll).toThrow("disk full");
      expect(store.get()).toEqual(saved);
      expect(createStore(file, await SqliteAppDatabase.open(dbPath)).get()).toEqual(saved);
      failure = "after";
      expect(store.delete).toThrow(CommittedFileWriteError);
      expect(store.get()).toBeNull();
      expect(createStore(file, await SqliteAppDatabase.open(dbPath)).get()).toBeNull();
      expect(store.set).toThrow(CommittedFileWriteError);
      expect(store.get()).not.toBeNull();
      expect(createStore(file, await SqliteAppDatabase.open(dbPath)).get()).toEqual(store.get());
      expect(store.clearAll).toThrow(CommittedFileWriteError);
      expect(store.get()).toBeNull();
      expect(createStore(file, await SqliteAppDatabase.open(dbPath)).get()).toBeNull();
    });
  }

  it("settings follow the actual commit outcome", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "sda-settings-failure-"));
    const dbPath = path.join(directory, "app.sqlite");
    const file = path.join(directory, "settings.json");
    let failure: "before" | "after" | null = null;
    const database = await SqliteAppDatabase.open(dbPath, { writeFile(filePath, bytes) {
      if (failure === "before") throw new Error("disk full");
      writePrivateFile(filePath, bytes);
      if (failure === "after") throw new CommittedFileWriteError(new Error("sync failed"));
    } });
    const store = new SettingsStore(file, database);
    const before = store.get();
    failure = "before";
    expect(() => store.update({ codexTimeoutMs: 42000 })).toThrow("disk full");
    expect(store.get()).toEqual(before);
    failure = "after";
    expect(() => store.update({ codexTimeoutMs: 42000 })).toThrow(CommittedFileWriteError);
    expect(store.get().codexTimeoutMs).toBe(42000);
    expect(new SettingsStore(file, await SqliteAppDatabase.open(dbPath)).get()).toEqual(store.get());
    failure = "before";
    expect(() => store.reset()).toThrow("disk full");
    expect(store.get().codexTimeoutMs).toBe(42000);
    failure = "after";
    expect(() => store.reset()).toThrow(CommittedFileWriteError);
    expect(store.get()).toEqual(before);
    expect(new SettingsStore(file, await SqliteAppDatabase.open(dbPath)).get()).toEqual(before);
  });
});
