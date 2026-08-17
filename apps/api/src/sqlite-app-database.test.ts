import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import initSqlJs from "sql.js/dist/sql-asm.js";
import { describe, expect, it } from "vitest";

import { createPersistedRecordCodec } from "./persisted-record";
import { writePrivateFile } from "./secure-file";
import { DatabaseSchemaVersionError, SqliteAppDatabase } from "./sqlite-app-database";

const testRecordCodec = createPersistedRecordCodec({
  domain: "test settings",
  version: 1,
  decodeData(value: unknown) {
    if (typeof value !== "object" || value === null || typeof (value as { value?: unknown }).value !== "string") {
      throw new Error("invalid");
    }
    return { value: (value as { value: string }).value };
  },
});

describe("SqliteAppDatabase", () => {
  it("tracks database schema versions separately from domain record versions", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-schema-version-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));

    expect(database.schemaVersion()).toBe(1);
  });

  it("rejects a database created by a newer app version", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-future-schema-"));
    const dbPath = path.join(dir, "app.sqlite");
    const SQL = await initSqlJs();
    const futureDatabase = new SQL.Database();
    futureDatabase.run("PRAGMA user_version = 99");
    writePrivateFile(dbPath, Buffer.from(futureDatabase.export()));
    futureDatabase.close();

    await expect(SqliteAppDatabase.open(dbPath)).rejects.toBeInstanceOf(DatabaseSchemaVersionError);
  });

  it("writes versioned records and upgrades supported legacy records on read", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-record-codec-"));
    const dbPath = path.join(dir, "app.sqlite");
    const database = await SqliteAppDatabase.open(dbPath);
    database.setJson("settings", "legacy", { value: "before-versioning" });

    expect(database.getRecord("settings", "legacy", testRecordCodec)).toEqual({ value: "before-versioning" });
    database.setRecord("settings", "current", testRecordCodec, { value: "current" });

    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.getJson("settings", "legacy")).toEqual({
      version: 1,
      data: { value: "before-versioning" },
    });
    expect(reopened.getRecord("settings", "current", testRecordCodec)).toEqual({ value: "current" });
  });

  it("persists deletes after prior writes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-delete-"));
    const dbPath = path.join(dir, "app.sqlite");
    const database = await SqliteAppDatabase.open(dbPath);

    database.setJson("ranking_imports", "draft-1", { value: 1 });
    database.setJson("ranking_imports", "draft-2", { value: 2 });

    expect(database.deleteJson("ranking_imports", "draft-1")).toBe(true);

    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.getJson("ranking_imports", "draft-1")).toBeNull();
    expect(reopened.getJson("ranking_imports", "draft-2")).toEqual({ value: 2 });
  });

  it("reports false when deleting a missing JSON record", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-delete-missing-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));

    expect(database.deleteJson("ranking_imports", "missing-draft")).toBe(false);
  });

  it("clears whole data categories and persists the result", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-clear-category-"));
    const dbPath = path.join(dir, "app.sqlite");
    const database = await SqliteAppDatabase.open(dbPath);

    database.setJson("ranking_imports", "draft-1", { value: 1 });
    database.setJson("ranking_imports", "draft-2", { value: 2 });
    database.setJson("weekly_projection_imports", "league-1:2025:1", { value: 3 });
    database.insertDecisionSnapshot({
      id: "snapshot-1",
      draftId: "draft-1",
      createdAt: "2026-07-28T00:00:00.000Z",
      trigger: "state-load",
      value: { private: true },
    });

    expect(database.clearJson("ranking_imports")).toBe(2);
    expect(database.clearAllDecisionSnapshots()).toBe(1);

    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.countJson("ranking_imports")).toBe(0);
    expect(reopened.countJson("weekly_projection_imports")).toBe(1);
    expect(reopened.countDecisionSnapshots()).toBe(0);
  });

  it("restores live state when durable replacement fails", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-write-failure-"));
    const dbPath = path.join(dir, "app.sqlite");
    let failWrites = false;
    const database = await SqliteAppDatabase.open(dbPath, {
      writeFile(filePath, data) {
        if (failWrites) throw new Error("simulated durable write failure");
        writePrivateFile(filePath, data);
      },
    });
    database.setJson("settings", "app", { value: "before" });

    failWrites = true;
    expect(() => database.setJson("settings", "app", { value: "after" }))
      .toThrow("simulated durable write failure");

    expect(database.getJson("settings", "app")).toEqual({ value: "before" });
    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.getJson("settings", "app")).toEqual({ value: "before" });
  });

  it("persists a logical batch with one durable replacement", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-batch-"));
    const dbPath = path.join(dir, "app.sqlite");
    let writes = 0;
    const database = await SqliteAppDatabase.open(dbPath, {
      writeFile(filePath, data) {
        writes += 1;
        writePrivateFile(filePath, data);
      },
    });
    writes = 0;

    database.batch(() => {
      database.setJson("ranking_imports", "draft-1", { value: 1 });
      database.setJson("ranking_imports", "draft-2", { value: 2 });
    });

    expect(writes).toBe(1);
    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.listJson("ranking_imports")).toEqual([
      ["draft-1", { value: 1 }],
      ["draft-2", { value: 2 }],
    ]);
  });

  it("restores a failed nested batch without writing partial state", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-nested-batch-"));
    const dbPath = path.join(dir, "app.sqlite");
    let writes = 0;
    const database = await SqliteAppDatabase.open(dbPath, {
      writeFile(filePath, data) {
        writes += 1;
        writePrivateFile(filePath, data);
      },
    });
    database.setJson("settings", "app", { value: "before" });
    writes = 0;

    expect(() => database.batch(() => {
      database.setJson("settings", "app", { value: "after" });
      database.batch(() => {
        database.setJson("ranking_imports", "draft-1", { value: 1 });
      });
      throw new Error("abort logical action");
    })).toThrow("abort logical action");

    expect(writes).toBe(0);
    expect(database.getJson("settings", "app")).toEqual({ value: "before" });
    expect(database.countJson("ranking_imports")).toBe(0);
    const reopened = await SqliteAppDatabase.open(dbPath);
    expect(reopened.getJson("settings", "app")).toEqual({ value: "before" });
    expect(reopened.countJson("ranking_imports")).toBe(0);
  });

  it("does not persist a batch containing only no-op deletes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sleeper-sqlite-noop-batch-"));
    let writes = 0;
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"), {
      writeFile(filePath, data) {
        writes += 1;
        writePrivateFile(filePath, data);
      },
    });
    writes = 0;

    database.batch(() => {
      expect(database.deleteJson("settings", "missing")).toBe(false);
      expect(database.clearDecisionSnapshots("missing-draft")).toBe(false);
    });

    expect(writes).toBe(0);
  });
});
