import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DraftPlanStore } from "./draft-plan-store";
import { SqliteAppDatabase } from "./sqlite-app-database";

describe("DraftPlanStore", () => {
  it("persists plans by draft, team, and provider", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sda-draft-plan-"));
    const database = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const store = new DraftPlanStore(database);
    const plan = {
      updatedAtPick: 12,
      approach: "Build a balanced RB/WR core.",
      currentPickFocus: ["RB" as const],
      nextTurnPriorities: ["WR" as const],
      positionsThatCanWait: ["QB" as const],
      rosterGoals: ["Add another starting receiver."],
      watchItems: ["Monitor the current WR tier."],
      changeSummary: "RB became more urgent after a positional run.",
    };

    store.set("draft-1", "team-5", "codex-app-server", plan);

    expect(store.get("draft-1", "team-5", "codex-app-server")).toEqual(plan);
    const reopenedDatabase = await SqliteAppDatabase.open(path.join(dir, "app.sqlite"));
    const reopenedStore = new DraftPlanStore(reopenedDatabase);
    expect(reopenedStore.get("draft-1", "team-5", "codex-app-server")).toEqual(plan);
    expect(store.get("draft-1", "team-6", "codex-app-server")).toBeNull();
    expect(store.get("draft-1", "team-5", "noop")).toBeNull();
    expect(store.clearAll()).toBe(1);
    expect(store.get("draft-1", "team-5", "codex-app-server")).toBeNull();
  });
});
