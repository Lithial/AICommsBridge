import type { Db } from "./db.js";

export function ensureChannel(db: Db, id: string): void {
  db.prepare("INSERT OR IGNORE INTO channels (id, created_at) VALUES (?, ?)").run(id, Date.now());
}

export interface ChannelSummary {
  id: string;
  title: string | null;
  createdAt: number;
  eventCount: number;
  lastUpdated: number | null;
}

export function listChannels(db: Db): ChannelSummary[] {
  const rows = db.prepare<[], {
    id: string; title: string | null; created_at: number;
    event_count: number; last_updated: number | null;
  }>(`
    SELECT c.id, c.title, c.created_at,
      COUNT(e.id)       AS event_count,
      MAX(e.updated_at) AS last_updated
    FROM channels c
    LEFT JOIN events e ON e.channel_id = c.id
    GROUP BY c.id
    ORDER BY MAX(e.updated_at) DESC, c.created_at DESC
  `).all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    eventCount: r.event_count,
    lastUpdated: r.last_updated,
  }));
}
