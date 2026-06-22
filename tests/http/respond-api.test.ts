import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import type { Express } from "express";
import { openDb, type Db } from "../../src/store/db.js";
import { Broadcaster } from "../../src/realtime/broadcaster.js";
import { FeedService } from "../../src/feed.js";
import { createApp } from "../../src/http/app.js";
import type { AskPayload } from "../../src/domain/events.js";

let dir: string; let db: Db; let feed: FeedService; let app: Express;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "acb-"));
  db = openDb(join(dir, "db.sqlite"));
  feed = new FeedService(db, new Broadcaster(), join(dir, "media"));
  app = createApp({ db, feed, mediaDir: join(dir, "media") });
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("POST /api/respond/:requestId", () => {
  it("returns 400 when answer is missing", async () => {
    const res = await request(app).post("/api/respond/any-id").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/answer required/i);
  });

  it("returns 404 for an unknown requestId", async () => {
    const res = await request(app).post("/api/respond/no-such-id").send({ answer: "yes" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("resolves the pending ask and returns 200", async () => {
    const promise = feed.askUser({ channelId: "default", question: "Go?" });
    const eventsRes = await request(app).get("/api/events");
    const requestId = (eventsRes.body.events[0].payload as AskPayload).requestId;

    const res = await request(app).post(`/api/respond/${requestId}`).send({ answer: "yes" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await promise).toBe("yes");
  });

  it("returns 404 on a second POST to an already-answered requestId", async () => {
    const promise = feed.askUser({ channelId: "default", question: "Go?" });
    const eventsRes = await request(app).get("/api/events");
    const requestId = (eventsRes.body.events[0].payload as AskPayload).requestId;

    await request(app).post(`/api/respond/${requestId}`).send({ answer: "yes" });
    await promise;
    const res = await request(app).post(`/api/respond/${requestId}`).send({ answer: "again" });
    expect(res.status).toBe(404);
  });
});
