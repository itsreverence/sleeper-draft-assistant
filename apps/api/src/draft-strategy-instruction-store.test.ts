import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DraftStrategyInstructionStore } from "./draft-strategy-instruction-store";
import { SqliteAppDatabase } from "./sqlite-app-database";

describe("DraftStrategyInstructionStore", () => {
  it("persists draft guidance and expires next-pick guidance after the board advances", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sda-strategy-instructions-"));
    const dbPath = path.join(dir, "app.sqlite");
    const database = await SqliteAppDatabase.open(dbPath);
    const store = new DraftStrategyInstructionStore(database);

    store.create("draft-1", "team-5", 12, { text: "Consider a tight end now.", scope: "next-pick" }, "manual");
    store.create("draft-1", "team-5", 12, { text: "Favor Bears players when value is close.", scope: "draft" }, "ai-chat");

    const reopenedStore = new DraftStrategyInstructionStore(await SqliteAppDatabase.open(dbPath));
    expect(reopenedStore.list("draft-1", "team-5", 12)).toHaveLength(2);
    expect(reopenedStore.list("draft-1", "team-6", 12)).toEqual([]);
    expect(reopenedStore.list("draft-1", "team-5", 13)).toMatchObject([
      { text: "Favor Bears players when value is close.", scope: "draft", source: "ai-chat" },
    ]);
  });

  it("updates and removes active guidance", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sda-strategy-instructions-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const store = new DraftStrategyInstructionStore(database);
    const [created] = store.create("draft-1", "team-5", 4, { text: "Wait on quarterback.", scope: "draft" }, "manual");

    const updated = store.update("draft-1", "team-5", 4, created!.id, { text: "Wait on quarterback this pick.", scope: "next-pick" });
    expect(updated?.[0]).toMatchObject({ text: "Wait on quarterback this pick.", scope: "next-pick", createdAtPick: 4 });
    expect(store.delete("draft-1", "team-5", 4, created!.id)).toEqual([]);
    expect(store.delete("draft-1", "team-5", 4, created!.id)).toBeNull();
  });
});
