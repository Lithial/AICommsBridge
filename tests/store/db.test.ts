import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/store/db.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("openDb", () => {
  it("creates events + channels tables and enables WAL", () => {
    dir = mkdtempSync(join(tmpdir(), "acb-"));
    const db = openDb(join(dir, "db.sqlite"));
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tables = rows.map((r) => r.name);
    expect(tables).toContain("events");
    expect(tables).toContain("channels");
    expect(String(db.pragma("journal_mode", { simple: true })).toLowerCase()).toBe("wal");
    db.close();
  });

  it("is idempotent across reopens", () => {
    dir = mkdtempSync(join(tmpdir(), "acb-"));
    const path = join(dir, "db.sqlite");
    openDb(path).close();
    const db = openDb(path);
    expect(() => db.prepare("SELECT * FROM events").all()).not.toThrow();
    db.close();
  });
});
