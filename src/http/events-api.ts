import { Router } from "express";
import type { Db } from "../store/db.js";
import type { FeedService } from "../feed.js";
import { queryEvents } from "../store/events.js";
import { listChannels } from "../store/channels.js";

export function eventsRouter(db: Db, feed: FeedService): Router {
  const r = Router();
  r.get("/events", (req, res) => {
    const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
    const events = queryEvents(db, {
      after: num(req.query.after),
      before: num(req.query.before),
      limit: num(req.query.limit),
      channelId: typeof req.query.channel === "string" ? req.query.channel : undefined,
    });
    res.json({ events });
  });
  r.delete("/events", (req, res) => {
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    const { deleted } = feed.clear({ channelId: channel });
    res.json({ deleted });
  });
  r.get("/channels", (_req, res) => {
    res.json({ channels: listChannels(db) });
  });
  return r;
}
