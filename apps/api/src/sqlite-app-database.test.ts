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
});
