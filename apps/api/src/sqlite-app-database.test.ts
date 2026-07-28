import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteAppDatabase } from "./sqlite-app-database";

describe("SqliteAppDatabase", () => {
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
});
