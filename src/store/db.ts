import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = Database.Database;

export function openDb(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      key TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_upsert
      ON events(channel_id, type, key) WHERE key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel_id, id);
  `);
}
