import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database } from "sql.js";

import { ensurePrivateDirectory, readPrivateFile, writePrivateFile } from "./secure-file";

export type JsonNamespace = "settings" | "ranking_imports";

export class SqliteAppDatabase {
  private constructor(
    private readonly db: Database,
    private readonly filePath: string,
  ) {
    this.migrate();
  }

  static async open(filePath = getDefaultDatabasePath()): Promise<SqliteAppDatabase> {
    const SQL = await initSqlJs();
    ensurePrivateDirectory(path.dirname(filePath));
    const db = existsSync(filePath) ? new SQL.Database(readPrivateFile(filePath)) : new SQL.Database();
    return new SqliteAppDatabase(db, filePath);
  }

  getJson<T>(namespace: JsonNamespace, key: string): T | null {
    const statement = this.db.prepare("SELECT value_json FROM app_kv WHERE namespace = ? AND key = ? LIMIT 1");
    try {
      statement.bind([namespace, key]);
      if (!statement.step()) {
        return null;
      }
      const row = statement.getAsObject() as { value_json?: string };
      return row.value_json ? (JSON.parse(row.value_json) as T) : null;
    } finally {
      statement.free();
    }
  }

  listJson<T>(namespace: JsonNamespace): Array<[string, T]> {
    const rows: Array<[string, T]> = [];
    const statement = this.db.prepare("SELECT key, value_json FROM app_kv WHERE namespace = ? ORDER BY key ASC");
    try {
      statement.bind([namespace]);
      while (statement.step()) {
        const row = statement.getAsObject() as { key?: string; value_json?: string };
        if (row.key && row.value_json) {
          rows.push([row.key, JSON.parse(row.value_json) as T]);
        }
      }
    } finally {
      statement.free();
    }
    return rows;
  }

  countJson(namespace: JsonNamespace): number {
    const statement = this.db.prepare("SELECT COUNT(*) AS count FROM app_kv WHERE namespace = ?");
    try {
      statement.bind([namespace]);
      statement.step();
      const row = statement.getAsObject() as { count?: number };
      return Number(row.count ?? 0);
    } finally {
      statement.free();
    }
  }

  setJson(namespace: JsonNamespace, key: string, value: unknown): void {
    this.db.run(
      `INSERT INTO app_kv (namespace, key, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [namespace, key, JSON.stringify(value), new Date().toISOString()],
    );
    this.persist();
  }

  deleteJson(namespace: JsonNamespace, key: string): boolean {
    this.db.run("DELETE FROM app_kv WHERE namespace = ? AND key = ?", [namespace, key]);
    const deleted = this.db.getRowsModified() > 0;
    if (deleted) {
      this.persist();
    }
    return deleted;
  }

  insertDecisionSnapshot(input: { id: string; draftId: string; createdAt: string; trigger: string; value: unknown }): void {
    this.db.run(
      `INSERT OR REPLACE INTO decision_snapshots (id, draft_id, created_at, trigger, value_json)
       VALUES (?, ?, ?, ?, ?)`,
      [input.id, input.draftId, input.createdAt, input.trigger, JSON.stringify(input.value)],
    );
    this.persist();
  }

  listDecisionSnapshots<T>(draftId: string, limit: number): T[] {
    const rows: T[] = [];
    const statement = this.db.prepare(
      "SELECT value_json FROM decision_snapshots WHERE draft_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    );
    try {
      statement.bind([draftId, limit]);
      while (statement.step()) {
        const row = statement.getAsObject() as { value_json?: string };
        if (row.value_json) {
          rows.push(JSON.parse(row.value_json) as T);
        }
      }
    } finally {
      statement.free();
    }
    return rows;
  }

  listAllDecisionSnapshots<T>(): T[] {
    const rows: T[] = [];
    const statement = this.db.prepare("SELECT value_json FROM decision_snapshots ORDER BY draft_id ASC, created_at DESC, id DESC");
    try {
      while (statement.step()) {
        const row = statement.getAsObject() as { value_json?: string };
        if (row.value_json) {
          rows.push(JSON.parse(row.value_json) as T);
        }
      }
    } finally {
      statement.free();
    }
    return rows;
  }

  countDecisionSnapshots(): number {
    const result = this.db.exec("SELECT COUNT(*) AS count FROM decision_snapshots");
    return Number(result[0]?.values[0]?.[0] ?? 0);
  }

  pruneDecisionSnapshots(draftId: string, keep: number): void {
    this.db.run(
      `DELETE FROM decision_snapshots
       WHERE draft_id = ?
         AND id NOT IN (
           SELECT id FROM decision_snapshots
           WHERE draft_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         )`,
      [draftId, draftId, keep],
    );
    if (this.db.getRowsModified() > 0) {
      this.persist();
    }
  }

  clearDecisionSnapshots(draftId: string): boolean {
    this.db.run("DELETE FROM decision_snapshots WHERE draft_id = ?", [draftId]);
    const deleted = this.db.getRowsModified() > 0;
    if (deleted) {
      this.persist();
    }
    return deleted;
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_kv (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, key)
      );

      CREATE TABLE IF NOT EXISTS decision_snapshots (
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        trigger TEXT NOT NULL,
        value_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_decision_snapshots_draft_created
        ON decision_snapshots (draft_id, created_at DESC);
    `);
    this.persist();
  }

  private persist(): void {
    const bytes = this.db.export();
    writePrivateFile(this.filePath, Buffer.from(bytes));
  }
}

function getDefaultDatabasePath(): string {
  if (process.env.NODE_ENV === "test") {
    return path.join(tmpdir(), "sleeper-draft-assistant-test", "app.sqlite");
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return process.env.SLEEPER_AI_DATA_DIR
    ? path.join(process.env.SLEEPER_AI_DATA_DIR, "app.sqlite")
    : path.join(repoRoot, "data", "app.sqlite");
}
