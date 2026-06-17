import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../../src/store/db.js";
import { upsertProgress, appendLog, queryEvents } from "../../src/store/events.js";
import type { LogPayload, ProgressPayload } from "../../src/domain/events.js";

let dir: string; let db: Db;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "acb-")); db = openDb(join(dir, "db.sqlite")); });
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("progress upsert", () => {
  it("same key patches in place (no new row)", () => {
    const a = upsertProgress(db, { channelId: "default", key: "build", payload: { label: "Building", percent: 10, status: "active" } });
    expect(a.created).toBe(true);
    const b = upsertProgress(db, { channelId: "default", key: "build", payload: { label: "Building", percent: 80, status: "active" } });
    expect(b.created).toBe(false);
    expect(b.event.id).toBe(a.event.id);
    expect((b.event.payload as ProgressPayload).percent).toBe(80);
    expect(queryEvents(db, {}).length).toBe(1);
  });

  it("different keys create distinct rows", () => {
    upsertProgress(db, { channelId: "default", key: "build", payload: { label: "Build", status: "active" } });
    upsertProgress(db, { channelId: "default", key: "test", payload: { label: "Test", status: "active" } });
    expect(queryEvents(db, {}).length).toBe(2);
  });
});

describe("log append", () => {
  it("appends lines to the same stream key", () => {
    appendLog(db, { channelId: "default", key: "run", text: "line1\nline2" });
    const r = appendLog(db, { channelId: "default", key: "run", text: "line3" });
    expect((r.event.payload as LogPayload).lines).toEqual(["line1", "line2", "line3"]);
    expect(queryEvents(db, {}).length).toBe(1);
  });

  it("caps at 1000 lines and tracks truncatedCount", () => {
    const big = Array.from({ length: 1200 }, (_, i) => `l${i}`).join("\n");
    const r = appendLog(db, { channelId: "default", key: "run", text: big });
    const p = r.event.payload as LogPayload;
    expect(p.lines.length).toBe(1000);
    expect(p.lines[0]).toBe("l200");
    expect(p.truncatedCount).toBe(200);
  });
});
