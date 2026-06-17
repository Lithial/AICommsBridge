import { Router } from "express";
import type { Db } from "../store/db.js";
import { queryEvents } from "../store/events.js";

export function eventsRouter(db: Db): Router {
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
  return r;
}
