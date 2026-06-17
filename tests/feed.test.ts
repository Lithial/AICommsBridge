import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../src/store/db.js";
import { Broadcaster } from "../src/realtime/broadcaster.js";
import { FeedService } from "../src/feed.js";
import { queryEvents } from "../src/store/events.js";
import { DEFAULT_CHANNEL } from "../src/domain/events.js";
import type { FeedMessage, CodePayload, ImagePayload } from "../src/domain/events.js";

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
});
