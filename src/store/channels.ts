import type { Db } from "./db.js";

export function ensureChannel(db: Db, id: string): void {
  db.prepare("INSERT OR IGNORE INTO channels (id, created_at) VALUES (?, ?)").run(id, Date.now());
}
