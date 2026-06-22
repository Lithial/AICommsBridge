import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../../src/store/db.js";
import { insertEvent, getEvent, queryEvents, clearEvents } from "../../src/store/events.js";
import type { NotePayload } from "../../src/domain/events.js";

let dir: string; let db: Db;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "acb-")); db = openDb(join(dir, "db.sqlite")); });
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("events store: append + query", () => {
  it("insertEvent returns a row with an id and round-trips payload", () => {
    const e = insertEvent(db, { channelId: "default", type: "note", payload: { markdown: "hi", level: "info" } });
    expect(e.id).toBeGreaterThan(0);
    expect(getEvent(db, e.id)?.payload).toEqual({ markdown: "hi", level: "info" });
  });

  it("queryEvents returns most-recent-N ascending when no cursor", () => {
    for (let i = 0; i < 5; i++) insertEvent(db, { channelId: "default", type: "note", payload: { markdown: `n${i}`, level: "info" } });
    const events = queryEvents(db, { limit: 3 });
    expect(events.map((e) => (e.payload as NotePayload).markdown)).toEqual(["n2", "n3", "n4"]);
  });

  it("queryEvents with `after` returns only newer rows ascending", () => {
    const ids = [0, 1, 2, 3].map((i) => insertEvent(db, { channelId: "default", type: "note", payload: { markdown: `n${i}`, level: "info" } }).id);
    const events = queryEvents(db, { after: ids[1] });
    expect(events.map((e) => e.id)).toEqual([ids[2], ids[3]]);
  });

  it("auto-creates the channel row on first insert", () => {
    insertEvent(db, { channelId: "proj-x", type: "note", payload: { markdown: "hi", level: "info" } });
    const ch = db.prepare("SELECT id FROM channels WHERE id = ?").get("proj-x") as { id: string } | undefined;
    expect(ch?.id).toBe("proj-x");
  });
});

describe("clearEvents", () => {
  it("deletes every event and returns the count plus image media ids", () => {
    insertEvent(db, { channelId: "default", type: "note", payload: { markdown: "n", level: "info" } });
    insertEvent(db, { channelId: "default", type: "image", payload: { mediaId: "abc.png", mime: "image/png" } });
    const { deleted, mediaIds } = clearEvents(db);
    expect(deleted).toBe(2);
    expect(mediaIds).toEqual(["abc.png"]);
    expect(queryEvents(db, {})).toEqual([]);
  });

  it("deletes only the named channel when scoped", () => {
    insertEvent(db, { channelId: "keep", type: "note", payload: { markdown: "a", level: "info" } });
    insertEvent(db, { channelId: "drop", type: "note", payload: { markdown: "b", level: "info" } });
    const { deleted } = clearEvents(db, "drop");
    expect(deleted).toBe(1);
    expect(queryEvents(db, {}).map((e) => e.channelId)).toEqual(["keep"]);
  });
});
