import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../src/store/db.js";
import { Broadcaster } from "../src/realtime/broadcaster.js";
import { FeedService } from "../src/feed.js";
import { queryEvents } from "../src/store/events.js";
import { mediaPath } from "../src/store/media-store.js";
import { DEFAULT_CHANNEL } from "../src/domain/events.js";
import type { FeedMessage, CodePayload, ImagePayload, AskPayload } from "../src/domain/events.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let dir: string; let db: Db; let bus: Broadcaster; let feed: FeedService; let seen: FeedMessage[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "acb-"));
  db = openDb(join(dir, "db.sqlite"));
  bus = new Broadcaster();
  seen = [];
  bus.subscribe((m) => seen.push(m));
  feed = new FeedService(db, bus, join(dir, "media"));
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("FeedService", () => {
  it("postNote persists and broadcasts a 'created' message", () => {
    const e = feed.postNote({ channelId: DEFAULT_CHANNEL, markdown: "hello" });
    expect(queryEvents(db, {}).length).toBe(1);
    expect(seen.at(-1)).toMatchObject({ kind: "created", event: { id: e.id } });
  });

  it("updateProgress broadcasts 'created' then 'updated' for the same key", () => {
    feed.updateProgress({ channelId: DEFAULT_CHANNEL, key: "b", label: "Build", percent: 10 });
    feed.updateProgress({ channelId: DEFAULT_CHANNEL, key: "b", label: "Build", percent: 90 });
    expect(seen.map((m) => m.kind)).toEqual(["created", "updated"]);
    expect(queryEvents(db, {}).length).toBe(1);
  });

  it("showImage stores the file and emits an image event", () => {
    const e = feed.showImage({ channelId: DEFAULT_CHANNEL, data: PNG, mimeType: "image/png", caption: "shot" });
    expect(e.type).toBe("image");
    expect((e.payload as ImagePayload).mediaId).toBeTruthy();
  });

  it("showImage with a missing path throws", () => {
    expect(() => feed.showImage({ channelId: DEFAULT_CHANNEL, path: join(dir, "nope.png") })).toThrow(/not found/i);
  });

  it("showDiff computes a unified patch from before/after", () => {
    const e = feed.showDiff({ channelId: DEFAULT_CHANNEL, before: "a\n", after: "b\n", filename: "x.txt" });
    const p = e.payload as CodePayload;
    expect(p.mode).toBe("diff");
    expect(p.diff).toContain("-a");
    expect(p.diff).toContain("+b");
  });

  it("clear removes events, prunes media files, and broadcasts 'cleared'", () => {
    const img = feed.showImage({ channelId: DEFAULT_CHANNEL, data: PNG, mimeType: "image/png" });
    const mediaFile = mediaPath(join(dir, "media"), (img.payload as ImagePayload).mediaId);
    expect(existsSync(mediaFile)).toBe(true);
    seen = [];
    const { deleted } = feed.clear();
    expect(deleted).toBe(1);
    expect(queryEvents(db, {})).toEqual([]);
    expect(existsSync(mediaFile)).toBe(false);
    expect(seen).toEqual([{ kind: "cleared", channelId: undefined }]);
  });

  it("clear scoped to a channel leaves other channels and reports the scope", () => {
    feed.postNote({ channelId: "keep", markdown: "stay" });
    feed.postNote({ channelId: "drop", markdown: "go" });
    seen = [];
    const { deleted } = feed.clear({ channelId: "drop" });
    expect(deleted).toBe(1);
    expect(queryEvents(db, {}).map((e) => e.channelId)).toEqual(["keep"]);
    expect(seen).toEqual([{ kind: "cleared", channelId: "drop" }]);
  });

  it("askUser inserts an ask event with answer null and resolves when respond is called", async () => {
    const promise = feed.askUser({ channelId: DEFAULT_CHANNEL, question: "Go?" });
    const events = queryEvents(db, {});
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("ask");
    expect((events[0].payload as AskPayload).answer).toBeNull();
    expect(seen.at(-1)).toMatchObject({ kind: "created", event: { type: "ask" } });

    seen = [];
    const { found } = feed.respond((events[0].payload as AskPayload).requestId, "yes");
    expect(found).toBe(true);
    expect(await promise).toBe("yes");
    expect(seen.at(-1)).toMatchObject({ kind: "updated", event: { type: "ask" } });
    const updated = queryEvents(db, {})[0];
    expect((updated.payload as AskPayload).answer).toBe("yes");
    expect((updated.payload as AskPayload).answeredAt).toBeGreaterThan(0);
  });

  it("respond returns found:false for an unknown requestId", () => {
    expect(feed.respond("no-such-id", "x").found).toBe(false);
  });

  it("two concurrent askUser calls resolve independently", async () => {
    const p1 = feed.askUser({ channelId: DEFAULT_CHANNEL, question: "First?" });
    const p2 = feed.askUser({ channelId: DEFAULT_CHANNEL, question: "Second?" });
    const events = queryEvents(db, {});
    const id1 = (events[0].payload as AskPayload).requestId;
    const id2 = (events[1].payload as AskPayload).requestId;
    feed.respond(id2, "b");
    feed.respond(id1, "a");
    expect(await p1).toBe("a");
    expect(await p2).toBe("b");
  });
});
