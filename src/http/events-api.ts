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
  r.post("/respond/:requestId", (req, res) => {
    const { requestId } = req.params;
    const answer = typeof req.body?.answer === "string" && req.body.answer.length > 0
      ? req.body.answer
      : undefined;
    if (!answer) { res.status(400).json({ error: "answer required" }); return; }
    const { found } = feed.respond(requestId, answer);
    if (!found) { res.status(404).json({ error: "not found" }); return; }
    res.json({ ok: true });
  });

  return r;
}
