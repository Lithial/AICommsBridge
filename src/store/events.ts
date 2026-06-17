import type { Db } from "./db.js";
import { ensureChannel } from "./channels.js";
import type { EventType, EventPayload, FeedEvent } from "../domain/events.js";

interface Row {
  id: number; channel_id: string; type: string; key: string | null;
  created_at: number; updated_at: number; payload: string;
}

function toEvent(row: Row): FeedEvent {
  return {
    id: row.id,
    channelId: row.channel_id,
    type: row.type as EventType,
    key: row.key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload: JSON.parse(row.payload) as EventPayload,
  };
}

export function insertEvent(
  db: Db,
  params: { channelId: string; type: EventType; payload: EventPayload; key?: string | null },
): FeedEvent {
  ensureChannel(db, params.channelId);
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO events (channel_id, type, key, created_at, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(params.channelId, params.type, params.key ?? null, now, now, JSON.stringify(params.payload));
  return getEvent(db, Number(info.lastInsertRowid))!;
}

export function getEvent(db: Db, id: number): FeedEvent | undefined {
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as Row | undefined;
  return row ? toEvent(row) : undefined;
}

export function queryEvents(
  db: Db,
  params: { after?: number; before?: number; limit?: number; channelId?: string } = {},
): FeedEvent[] {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (params.after != null) { clauses.push("id > ?"); args.push(params.after); }
  if (params.before != null) { clauses.push("id < ?"); args.push(params.before); }
  if (params.channelId != null) { clauses.push("channel_id = ?"); args.push(params.channelId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(params.limit ?? 200, 1000);

  if (params.after != null) {
    const rows = db.prepare(`SELECT * FROM events ${where} ORDER BY id ASC LIMIT ?`).all(...args, limit) as Row[];
    return rows.map(toEvent);
  }
  const rows = db
    .prepare(`SELECT * FROM (SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?) ORDER BY id ASC`)
    .all(...args, limit) as Row[];
  return rows.map(toEvent);
}
