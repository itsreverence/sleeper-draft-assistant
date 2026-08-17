import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database } from "sql.js";

import type { PersistedRecordCodec } from "./persisted-record";
import { ensurePrivateDirectory, readPrivateFile, writePrivateFile } from "./secure-file";

export type JsonNamespace =
  | "settings"
  | "ranking_imports"
  | "season_projection_imports"
  | "adp_imports"
  | "ros_ranking_imports"
  | "weekly_projection_imports"
  | "draft_plans"
  | "draft_strategy_instructions";

export type SqliteAppDatabaseOptions = {
  writeFile?: (filePath: string, data: Buffer) => void;
};

type MutationResult<T> = {
  value: T;
  changed: boolean;
};

const CURRENT_DATABASE_SCHEMA_VERSION = 1;

export class DatabaseSchemaVersionError extends Error {
  constructor() {
    super("Local data was created by a newer app version. Update the app before continuing.");
    this.name = "DatabaseSchemaVersionError";
  }
}

export class SqliteAppDatabase {
  private batchDepth = 0;
  private batchDirty = false;

  private constructor(
    private db: Database,
    private readonly filePath: string,
    private readonly createDatabase: (data?: Uint8Array) => Database,
    private readonly writeFile: (filePath: string, data: Buffer) => void,
  ) {
    this.migrate();
  }

  static async open(
    filePath = getDefaultDatabasePath(),
    options: SqliteAppDatabaseOptions = {},
  ): Promise<SqliteAppDatabase> {
    const SQL = await initSqlJs();
    ensurePrivateDirectory(path.dirname(filePath));
    const createDatabase = (data?: Uint8Array) => new SQL.Database(data);
    const db = existsSync(filePath) ? createDatabase(readPrivateFile(filePath)) : createDatabase();
    return new SqliteAppDatabase(db, filePath, createDatabase, options.writeFile ?? writePrivateFile);
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

  getRecord<T>(namespace: JsonNamespace, key: string, codec: PersistedRecordCodec<T>): T | null {
    const value = this.getJson<unknown>(namespace, key);
    if (value === null) return null;
    const decoded = codec.decode(value);
    if (decoded.migrated) this.setRecord(namespace, key, codec, decoded.data);
    return decoded.data;
  }

  listRecords<T>(namespace: JsonNamespace, codec: PersistedRecordCodec<T>): Array<[string, T]> {
    const decoded = this.listJson<unknown>(namespace).map(([key, value]) => {
      const record = codec.decode(value);
      return { key, ...record };
    });
    const migrated = decoded.filter((record) => record.migrated);
    if (migrated.length > 0) {
      this.batch(() => {
        for (const record of migrated) this.setRecord(namespace, record.key, codec, record.data);
      });
    }
    return decoded.map((record) => [record.key, record.data]);
  }

  setRecord<T>(namespace: JsonNamespace, key: string, codec: PersistedRecordCodec<T>, value: T): void {
    this.setJson(namespace, key, codec.encode(value));
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

  schemaVersion(): number {
    const result = this.db.exec("PRAGMA user_version");
    return Number(result[0]?.values[0]?.[0] ?? 0);
  }

  setJson(namespace: JsonNamespace, key: string, value: unknown): void {
    this.mutate(() => {
      this.db.run(
        `INSERT INTO app_kv (namespace, key, value_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [namespace, key, JSON.stringify(value), new Date().toISOString()],
      );
      return { value: undefined, changed: true };
    });
  }

  deleteJson(namespace: JsonNamespace, key: string): boolean {
    return this.mutate(() => {
      this.db.run("DELETE FROM app_kv WHERE namespace = ? AND key = ?", [namespace, key]);
      const deleted = this.db.getRowsModified() > 0;
      return { value: deleted, changed: deleted };
    });
  }

  clearJson(namespace: JsonNamespace): number {
    return this.mutate(() => {
      this.db.run("DELETE FROM app_kv WHERE namespace = ?", [namespace]);
      const deleted = this.db.getRowsModified();
      return { value: deleted, changed: deleted > 0 };
    });
  }

  insertDecisionSnapshot(input: { id: string; draftId: string; createdAt: string; trigger: string; value: unknown }): void {
    this.mutate(() => {
      this.db.run(
        `INSERT OR REPLACE INTO decision_snapshots (id, draft_id, created_at, trigger, value_json)
         VALUES (?, ?, ?, ?, ?)`,
        [input.id, input.draftId, input.createdAt, input.trigger, JSON.stringify(input.value)],
      );
      return { value: undefined, changed: true };
    });
  }

  insertDecisionRecord<T>(
    input: { id: string; draftId: string; createdAt: string; trigger: string; value: T },
    codec: PersistedRecordCodec<T>,
  ): void {
    this.insertDecisionSnapshot({ ...input, value: codec.encode(input.value) });
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

  listDecisionRecords<T>(draftId: string, limit: number, codec: PersistedRecordCodec<T>): T[] {
    return this.decodeDecisionRecords(this.listDecisionSnapshots<unknown>(draftId, limit), codec);
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

  listAllDecisionRecords<T>(codec: PersistedRecordCodec<T>): T[] {
    return this.decodeDecisionRecords(this.listAllDecisionSnapshots<unknown>(), codec);
  }

  countDecisionSnapshots(): number {
    const result = this.db.exec("SELECT COUNT(*) AS count FROM decision_snapshots");
    return Number(result[0]?.values[0]?.[0] ?? 0);
  }

  pruneDecisionSnapshots(draftId: string, keep: number): void {
    this.mutate(() => {
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
      return { value: undefined, changed: this.db.getRowsModified() > 0 };
    });
  }

  clearDecisionSnapshots(draftId: string): boolean {
    return this.mutate(() => {
      this.db.run("DELETE FROM decision_snapshots WHERE draft_id = ?", [draftId]);
      const deleted = this.db.getRowsModified() > 0;
      return { value: deleted, changed: deleted };
    });
  }

  clearAllDecisionSnapshots(): number {
    return this.mutate(() => {
      this.db.run("DELETE FROM decision_snapshots");
      const deleted = this.db.getRowsModified();
      return { value: deleted, changed: deleted > 0 };
    });
  }

  batch<T>(operation: () => T): T {
    if (this.batchDepth > 0) {
      this.batchDepth += 1;
      try {
        return operation();
      } finally {
        this.batchDepth -= 1;
      }
    }

    const before = this.db.export();
    this.batchDepth = 1;
    this.batchDirty = false;
    try {
      const result = operation();
      this.batchDepth = 0;
      if (this.batchDirty) this.persist();
      this.batchDirty = false;
      return result;
    } catch (error) {
      this.batchDepth = 0;
      this.batchDirty = false;
      this.restore(before);
      throw error;
    }
  }

  private migrate(): void {
    const existingVersion = this.schemaVersion();
    if (existingVersion > CURRENT_DATABASE_SCHEMA_VERSION) {
      throw new DatabaseSchemaVersionError();
    }
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
    if (existingVersion < CURRENT_DATABASE_SCHEMA_VERSION) {
      this.db.run(`PRAGMA user_version = ${CURRENT_DATABASE_SCHEMA_VERSION}`);
      this.persist();
    }
  }

  private persist(): void {
    const bytes = this.db.export();
    this.writeFile(this.filePath, Buffer.from(bytes));
  }

  private decodeDecisionRecords<T>(values: unknown[], codec: PersistedRecordCodec<T>): T[] {
    const decoded = values.map((value) => codec.decode(value));
    const migrated = decoded.filter((record) => record.migrated);
    if (migrated.length > 0) {
      this.batch(() => {
        for (const record of migrated) {
          const value = record.data as T & { id: string; draftId: string; createdAt: string; trigger: string };
          this.insertDecisionRecord({
            id: value.id,
            draftId: value.draftId,
            createdAt: value.createdAt,
            trigger: value.trigger,
            value: record.data,
          }, codec);
        }
      });
    }
    return decoded.map((record) => record.data);
  }

  private mutate<T>(operation: () => MutationResult<T>): T {
    if (this.batchDepth > 0) {
      const result = operation();
      this.batchDirty ||= result.changed;
      return result.value;
    }

    const before = this.db.export();
    try {
      const result = operation();
      if (result.changed) this.persist();
      return result.value;
    } catch (error) {
      this.restore(before);
      throw error;
    }
  }

  private restore(bytes: Uint8Array): void {
    this.db.close();
    this.db = this.createDatabase(bytes);
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
