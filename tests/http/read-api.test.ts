import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { openDb, type Db } from "../../src/store/db.js";
import { Broadcaster } from "../../src/realtime/broadcaster.js";
import { FeedService } from "../../src/feed.js";
import { eventsRouter } from "../../src/http/events-api.js";
import { mediaRouter } from "../../src/http/media.js";
import { DEFAULT_CHANNEL } from "../../src/domain/events.js";
import type { FeedEvent, NotePayload, ImagePayload } from "../../src/domain/events.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let dir: string; let db: Db; let feed: FeedService; let app: express.Express; let mediaDir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "acb-"));
  mediaDir = join(dir, "media");
  db = openDb(join(dir, "db.sqlite"));
  feed = new FeedService(db, new Broadcaster(), mediaDir);
  app = express();
  app.use("/api", eventsRouter(db));
  app.use("/media", mediaRouter(mediaDir));
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("GET /api/events", () => {
  it("returns persisted events ascending", async () => {
    feed.postNote({ channelId: DEFAULT_CHANNEL, markdown: "one" });
    feed.postNote({ channelId: DEFAULT_CHANNEL, markdown: "two" });
    const res = await request(app).get("/api/events");
    expect(res.status).toBe(200);
    expect((res.body as { events: FeedEvent[] }).events.map((e) => (e.payload as NotePayload).markdown)).toEqual(["one", "two"]);
  });

  it("supports the `after` cursor", async () => {
    const a = feed.postNote({ channelId: DEFAULT_CHANNEL, markdown: "one" });
    feed.postNote({ channelId: DEFAULT_CHANNEL, markdown: "two" });
    const res = await request(app).get(`/api/events?after=${a.id}`);
    expect((res.body as { events: FeedEvent[] }).events.map((e) => (e.payload as NotePayload).markdown)).toEqual(["two"]);
  });
});

describe("GET /media/:id", () => {
  it("serves a stored image and 404s unknown ids", async () => {
    const e = feed.showImage({ channelId: DEFAULT_CHANNEL, data: PNG, mimeType: "image/png" });
    const id = (e.payload as ImagePayload).mediaId;
    const ok = await request(app).get(`/media/${id}`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("image/png");
    const missing = await request(app).get("/media/does-not-exist.png");
    expect(missing.status).toBe(404);
  });

  it("rejects path traversal", async () => {
    const res = await request(app).get("/media/..%2f..%2fetc%2fpasswd");
    expect([400, 404]).toContain(res.status);
  });
});
