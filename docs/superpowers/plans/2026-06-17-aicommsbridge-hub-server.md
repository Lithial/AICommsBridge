# AICommsBridge Hub Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone always-on hub: a single Node process that exposes MCP tools over Streamable HTTP, persists every pushed item to SQLite + media files, and offers a REST read API plus a WebSocket live-push channel.

**Architecture:** One long-running Express server bound to `127.0.0.1`. Each MCP tool call flows **validate → persist (SQLite/media) → broadcast (WebSocket)**. The browser (built separately, see the web-ui plan) is a pure consumer of `/api/events` (history/backfill) and `/ws` (live). The server's lifetime is independent of any agent session, so the UI survives restarts.

**Tech Stack:** Node 22.18.0, TypeScript (NodeNext ESM), `@modelcontextprotocol/sdk` (Streamable HTTP), Express, `ws`, `better-sqlite3` (WAL), `zod`, `diff`, `image-size`. Tests with `vitest` + `supertest`.

---

## File Structure

```
src/
  index.ts              # CLI entry: load config, start hub, serve web/dist
  hub.ts                # wire http + ws + storage + feed service; lifecycle
  config.ts             # env-driven config (port, data dir, paths)
  domain/
    events.ts           # FeedEvent type + per-type payload zod schemas + DEFAULT_CHANNEL
    diff.ts             # unified-diff helper (before/after -> patch text)
  store/
    db.ts               # open better-sqlite3, WAL, migrations
    channels.ts         # ensureChannel
    events.ts           # insertEvent, getEvent, queryEvents, upsertProgress, appendLog
    media-store.ts      # save base64/file to disk, dimensions, path helpers
  realtime/
    broadcaster.ts      # in-memory pub/sub (framework-agnostic, testable)
    throttle.ts         # coalesce 'updated' messages per event id (~10/s)
    ws.ts               # attach WebSocketServer to http.Server, per-connection subscribe
  feed.ts               # FeedService: ties store + media + broadcaster (the app layer)
  mcp/
    server.ts           # createMcpServer(feed): registers the 7 tools
  http/
    app.ts              # express app: /api, /media, /mcp (Streamable HTTP), static
    events-api.ts       # GET /api/events
    media.ts            # GET /media/:id
tests/                  # vitest specs mirror src/
```

**Key decisions locked here:**
- `FeedEvent` shapes and payload schemas live in `src/domain/events.ts` — the single source of truth (the web UI imports these as **types only**).
- Ordering/pagination cursor is the SQLite autoincrement `id`.
- In-place types (`progress`, `log`) upsert by `(channel_id, type, key)`; everything else appends.
- Server binds to `127.0.0.1` only — that is the security boundary (no DNS-rebinding config needed for v1).

---

## Task 1: Project scaffolding & toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "aicommsbridge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "aicommsbridge": "dist/index.js" },
  "scripts": {
    "start:dev": "tsx src/index.ts",
    "dev:hub": "tsx watch src/index.ts",
    "dev:web": "vite --config web/vite.config.ts",
    "build:web": "vite build --config web/vite.config.ts",
    "build:server": "tsc -p tsconfig.json",
    "build": "npm run build:web && npm run build:server",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "better-sqlite3": "^11.8.0",
    "diff": "^5.2.0",
    "express": "^4.21.0",
    "image-size": "^1.1.1",
    "ws": "^8.18.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/diff": "^5.2.1",
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "@types/ws": "^8.5.13",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.base.json` and `tsconfig.json`**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true
  }
}
```

`tsconfig.json`:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vitest.config.ts` and `.gitignore`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
web/dist/
*.sqlite
*.sqlite-*
.aicommsbridge/
```

- [ ] **Step 4: Write the failing test `tests/config.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

const KEYS = ["AICB_PORT", "AICB_DATA_DIR"] as const;
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("loadConfig", () => {
  it("defaults port to 4319 and data dir under home", () => {
    const c = loadConfig();
    expect(c.port).toBe(4319);
    expect(c.dbPath.endsWith("db.sqlite")).toBe(true);
    expect(c.mediaDir.endsWith("media")).toBe(true);
  });

  it("honors env overrides", () => {
    process.env.AICB_PORT = "5005";
    process.env.AICB_DATA_DIR = "/tmp/acb-test";
    const c = loadConfig();
    expect(c.port).toBe(5005);
    expect(c.dataDir).toBe("/tmp/acb-test");
    expect(c.dbPath).toBe("/tmp/acb-test/db.sqlite");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm install && npx vitest run tests/config.test.ts`
Expected: FAIL — cannot resolve `../src/config.js`.

- [ ] **Step 6: Implement `src/config.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  port: number;
  dataDir: string;
  dbPath: string;
  mediaDir: string;
}

export function loadConfig(): Config {
  const dataDir = process.env.AICB_DATA_DIR ?? join(homedir(), ".aicommsbridge");
  return {
    port: Number(process.env.AICB_PORT ?? 4319),
    dataDir,
    dbPath: join(dataDir, "db.sqlite"),
    mediaDir: join(dataDir, "media"),
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.base.json tsconfig.json vitest.config.ts .gitignore src/config.ts tests/config.test.ts package-lock.json
git commit -m "chore: scaffold hub server toolchain + config"
```

---

## Task 2: Domain event types & payload schemas

**Files:**
- Create: `src/domain/events.ts`
- Test: `tests/domain/events.test.ts`

- [ ] **Step 1: Write the failing test `tests/domain/events.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { notePayloadSchema, progressPayloadSchema, linkPayloadSchema, DEFAULT_CHANNEL } from "../../src/domain/events.js";

describe("payload schemas", () => {
  it("note applies default level 'info'", () => {
    const p = notePayloadSchema.parse({ markdown: "hi" });
    expect(p.level).toBe("info");
  });

  it("progress rejects percent out of range", () => {
    expect(() => progressPayloadSchema.parse({ label: "x", percent: 150 })).toThrow();
  });

  it("link requires a valid url", () => {
    expect(() => linkPayloadSchema.parse({ url: "not a url" })).toThrow();
  });

  it("exposes a default channel constant", () => {
    expect(DEFAULT_CHANNEL).toBe("default");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/domain/events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/events.ts`**

```ts
import { z } from "zod";

export const DEFAULT_CHANNEL = "default";

export const EVENT_TYPES = ["image", "note", "progress", "code", "link", "log"] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = (typeof EVENT_TYPES)[number];

export const imagePayloadSchema = z.object({
  mediaId: z.string(),
  mime: z.string(),
  caption: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type ImagePayload = z.infer<typeof imagePayloadSchema>;

export const notePayloadSchema = z.object({
  markdown: z.string(),
  level: z.enum(["info", "important", "success", "warn", "error"]).default("info"),
  title: z.string().optional(),
});
export type NotePayload = z.infer<typeof notePayloadSchema>;

export const progressPayloadSchema = z.object({
  label: z.string(),
  percent: z.number().min(0).max(100).optional(),
  status: z.enum(["active", "done", "error"]).default("active"),
});
export type ProgressPayload = z.infer<typeof progressPayloadSchema>;

export const codePayloadSchema = z.object({
  mode: z.enum(["code", "diff"]),
  code: z.string().optional(),
  diff: z.string().optional(),
  language: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});
export type CodePayload = z.infer<typeof codePayloadSchema>;

export const linkPayloadSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
});
export type LinkPayload = z.infer<typeof linkPayloadSchema>;

export const logPayloadSchema = z.object({
  title: z.string().optional(),
  lines: z.array(z.string()),
  truncatedCount: z.number().int().nonnegative().default(0),
});
export type LogPayload = z.infer<typeof logPayloadSchema>;

export type EventPayload =
  | ImagePayload | NotePayload | ProgressPayload
  | CodePayload | LinkPayload | LogPayload;

export interface FeedEvent {
  id: number;
  channelId: string;
  type: EventType;
  key: string | null;
  createdAt: number;
  updatedAt: number;
  payload: EventPayload;
}

export interface FeedMessage {
  kind: "created" | "updated";
  event: FeedEvent;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/domain/events.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/events.ts tests/domain/events.test.ts
git commit -m "feat: domain event types and payload schemas"
```

---

## Task 3: Database open & migrations

**Files:**
- Create: `src/store/db.ts`
- Test: `tests/store/db.test.ts`

- [ ] **Step 1: Write the failing test `tests/store/db.test.ts`**

```ts
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
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/store/db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/store/db.ts`**

```ts
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = Database.Database;

export function openDb(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      key TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_upsert
      ON events(channel_id, type, key) WHERE key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel_id, id);
  `);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/store/db.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/db.ts tests/store/db.test.ts
git commit -m "feat: sqlite open + migrations (WAL)"
```

---

## Task 4: Channels helper + events store (append & query)

**Files:**
- Create: `src/store/channels.ts`, `src/store/events.ts`
- Test: `tests/store/events.test.ts`

- [ ] **Step 1: Write the failing test `tests/store/events.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../../src/store/db.js";
import { insertEvent, getEvent, queryEvents } from "../../src/store/events.js";

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
    expect(events.map((e) => (e.payload as any).markdown)).toEqual(["n2", "n3", "n4"]);
  });

  it("queryEvents with `after` returns only newer rows ascending", () => {
    const ids = [0, 1, 2, 3].map((i) => insertEvent(db, { channelId: "default", type: "note", payload: { markdown: `n${i}`, level: "info" } }).id);
    const events = queryEvents(db, { after: ids[1] });
    expect(events.map((e) => e.id)).toEqual([ids[2], ids[3]]);
  });

  it("auto-creates the channel row on first insert", () => {
    insertEvent(db, { channelId: "proj-x", type: "note", payload: { markdown: "hi", level: "info" } });
    const ch = db.prepare("SELECT id FROM channels WHERE id = ?").get("proj-x") as any;
    expect(ch?.id).toBe("proj-x");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/store/events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/store/channels.ts`**

```ts
import type { Db } from "./db.js";

export function ensureChannel(db: Db, id: string): void {
  db.prepare("INSERT OR IGNORE INTO channels (id, created_at) VALUES (?, ?)").run(id, Date.now());
}
```

- [ ] **Step 4: Implement `src/store/events.ts` (append + query portion)**

```ts
import type { Db } from "./db.js";
import { ensureChannel } from "./channels.js";
import type { EventType, EventPayload, FeedEvent } from "../domain/events.js";

interface Row {
  id: number; channel_id: string; type: string; key: string | null;
  created_at: number; updated_at: number; payload: string;
}

function toEvent(row: Row): FeedEvent {
  return {
    id: row.id,
    channelId: row.channel_id,
    type: row.type as EventType,
    key: row.key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload: JSON.parse(row.payload) as EventPayload,
  };
}

export function insertEvent(
  db: Db,
  params: { channelId: string; type: EventType; payload: EventPayload; key?: string | null },
): FeedEvent {
  ensureChannel(db, params.channelId);
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO events (channel_id, type, key, created_at, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(params.channelId, params.type, params.key ?? null, now, now, JSON.stringify(params.payload));
  return getEvent(db, Number(info.lastInsertRowid))!;
}

export function getEvent(db: Db, id: number): FeedEvent | undefined {
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as Row | undefined;
  return row ? toEvent(row) : undefined;
}

export function queryEvents(
  db: Db,
  params: { after?: number; before?: number; limit?: number; channelId?: string } = {},
): FeedEvent[] {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (params.after != null) { clauses.push("id > ?"); args.push(params.after); }
  if (params.before != null) { clauses.push("id < ?"); args.push(params.before); }
  if (params.channelId != null) { clauses.push("channel_id = ?"); args.push(params.channelId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(params.limit ?? 200, 1000);

  if (params.after != null) {
    // forward pagination from a cursor: oldest-after-cursor first
    const rows = db.prepare(`SELECT * FROM events ${where} ORDER BY id ASC LIMIT ?`).all(...args, limit) as Row[];
    return rows.map(toEvent);
  }
  // most recent N, returned ascending
  const rows = db
    .prepare(`SELECT * FROM (SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?) ORDER BY id ASC`)
    .all(...args, limit) as Row[];
  return rows.map(toEvent);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/store/events.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/store/channels.ts src/store/events.ts tests/store/events.test.ts
git commit -m "feat: events store append + cursor query + channel auto-create"
```

---

## Task 5: In-place semantics — progress upsert & log append/cap

**Files:**
- Modify: `src/store/events.ts` (add `upsertProgress`, `appendLog`)
- Test: `tests/store/in-place.test.ts`

- [ ] **Step 1: Write the failing test `tests/store/in-place.test.ts`**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/store/in-place.test.ts`
Expected: FAIL — `upsertProgress` / `appendLog` are not exported.

- [ ] **Step 3: Implement — append to `src/store/events.ts`**

Add these imports at the top (extend the existing domain import):
```ts
import type { EventType, EventPayload, FeedEvent, ProgressPayload, LogPayload } from "../domain/events.js";
```

Add the constant near the top of the file:
```ts
const LOG_CAP = 1000;
```

Append these functions to the end of the file:
```ts
export function upsertProgress(
  db: Db,
  params: { channelId: string; key: string; payload: ProgressPayload },
): { event: FeedEvent; created: boolean } {
  ensureChannel(db, params.channelId);
  const existing = db
    .prepare("SELECT id FROM events WHERE channel_id = ? AND type = 'progress' AND key = ?")
    .get(params.channelId, params.key) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE events SET payload = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(params.payload), Date.now(), existing.id);
    return { event: getEvent(db, existing.id)!, created: false };
  }
  const event = insertEvent(db, { channelId: params.channelId, type: "progress", key: params.key, payload: params.payload });
  return { event, created: true };
}

function capLines(lines: string[], priorTruncated: number): { lines: string[]; truncatedCount: number } {
  if (lines.length <= LOG_CAP) return { lines, truncatedCount: priorTruncated };
  const dropped = lines.length - LOG_CAP;
  return { lines: lines.slice(dropped), truncatedCount: priorTruncated + dropped };
}

export function appendLog(
  db: Db,
  params: { channelId: string; key: string; text: string; title?: string },
): { event: FeedEvent; created: boolean } {
  ensureChannel(db, params.channelId);
  const incoming = params.text.split("\n");
  const existing = db
    .prepare("SELECT id, payload FROM events WHERE channel_id = ? AND type = 'log' AND key = ?")
    .get(params.channelId, params.key) as { id: number; payload: string } | undefined;

  if (existing) {
    const prev = JSON.parse(existing.payload) as LogPayload;
    const capped = capLines([...prev.lines, ...incoming], prev.truncatedCount);
    const next: LogPayload = { title: prev.title ?? params.title, lines: capped.lines, truncatedCount: capped.truncatedCount };
    db.prepare("UPDATE events SET payload = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), Date.now(), existing.id);
    return { event: getEvent(db, existing.id)!, created: false };
  }

  const capped = capLines(incoming, 0);
  const payload: LogPayload = { title: params.title, lines: capped.lines, truncatedCount: capped.truncatedCount };
  const event = insertEvent(db, { channelId: params.channelId, type: "log", key: params.key, payload });
  return { event, created: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/store/in-place.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/events.ts tests/store/in-place.test.ts
git commit -m "feat: progress upsert + log append with 1000-line cap"
```

---

## Task 6: Media store

**Files:**
- Create: `src/store/media-store.ts`
- Test: `tests/store/media-store.test.ts`

- [ ] **Step 1: Write the failing test `tests/store/media-store.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveMediaFromBuffer, saveMediaFromPath, mediaPath } from "../../src/store/media-store.js";

// 1x1 transparent PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "acb-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("media store", () => {
  it("saves a base64 buffer and reports png dimensions", () => {
    const m = saveMediaFromBuffer(dir, Buffer.from(PNG_BASE64, "base64"), "image/png");
    expect(m.mediaId.endsWith(".png")).toBe(true);
    expect(existsSync(mediaPath(dir, m.mediaId))).toBe(true);
    expect(m.width).toBe(1);
    expect(m.height).toBe(1);
  });

  it("saves from a file path, inferring mime from extension", () => {
    const src = join(dir, "shot.png");
    writeFileSync(src, Buffer.from(PNG_BASE64, "base64"));
    const m = saveMediaFromPath(dir, src);
    expect(m.mime).toBe("image/png");
    expect(existsSync(mediaPath(dir, m.mediaId))).toBe(true);
  });

  it("throws a clear error when the path does not exist", () => {
    expect(() => saveMediaFromPath(dir, join(dir, "missing.png"))).toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/store/media-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/store/media-store.ts`**

```ts
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import sizeOf from "image-size";

export interface StoredMedia {
  mediaId: string;
  mime: string;
  width?: number;
  height?: number;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function mediaPath(dir: string, mediaId: string): string {
  return join(dir, mediaId);
}

export function saveMediaFromBuffer(dir: string, buffer: Buffer, mime: string): StoredMedia {
  mkdirSync(dir, { recursive: true });
  const ext = MIME_TO_EXT[mime] ?? "bin";
  const mediaId = `${randomUUID()}.${ext}`;
  writeFileSync(mediaPath(dir, mediaId), buffer);
  let width: number | undefined;
  let height: number | undefined;
  try {
    const d = sizeOf(buffer);
    width = d.width;
    height = d.height;
  } catch {
    /* non-image or undetectable; dimensions stay undefined */
  }
  return { mediaId, mime, width, height };
}

export function saveMediaFromPath(dir: string, path: string, mimeOverride?: string): StoredMedia {
  if (!existsSync(path)) throw new Error(`Image path not found: ${path}`);
  const buffer = readFileSync(path);
  const mime = mimeOverride ?? EXT_TO_MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  return saveMediaFromBuffer(dir, buffer, mime);
}
```

> Note: `image-size` v1 default-exports the sizing function (`import sizeOf from "image-size"`). If you install v2+, switch to `import { imageSize as sizeOf } from "image-size"`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/store/media-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/media-store.ts tests/store/media-store.test.ts
git commit -m "feat: media store (save base64/file, dimensions, mime)"
```

---

## Task 7: Broadcaster + update throttler

**Files:**
- Create: `src/realtime/broadcaster.ts`, `src/realtime/throttle.ts`
- Test: `tests/realtime/broadcaster.test.ts`, `tests/realtime/throttle.test.ts`

- [ ] **Step 1: Write the failing test `tests/realtime/broadcaster.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { Broadcaster } from "../../src/realtime/broadcaster.js";
import type { FeedMessage } from "../../src/domain/events.js";

const msg = (id: number): FeedMessage => ({ kind: "created", event: { id, channelId: "default", type: "note", key: null, createdAt: 0, updatedAt: 0, payload: { markdown: "x", level: "info" } } });

describe("Broadcaster", () => {
  it("delivers to all subscribers and supports unsubscribe", () => {
    const b = new Broadcaster();
    const a = vi.fn(); const c = vi.fn();
    const offA = b.subscribe(a); b.subscribe(c);
    b.broadcast(msg(1));
    offA();
    b.broadcast(msg(2));
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(2);
  });

  it("isolates a throwing subscriber from the rest", () => {
    const b = new Broadcaster();
    b.subscribe(() => { throw new Error("boom"); });
    const ok = vi.fn();
    b.subscribe(ok);
    expect(() => b.broadcast(msg(1))).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/realtime/broadcaster.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/realtime/broadcaster.ts`**

```ts
import type { FeedMessage } from "../domain/events.js";

export type Subscriber = (msg: FeedMessage) => void;

export class Broadcaster {
  private subs = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }

  broadcast(msg: FeedMessage): void {
    for (const fn of [...this.subs]) {
      try { fn(msg); } catch { /* isolate one bad subscriber */ }
    }
  }

  get size(): number {
    return this.subs.size;
  }
}
```

- [ ] **Step 4: Write the failing test `tests/realtime/throttle.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThrottler } from "../../src/realtime/throttle.js";
import type { FeedMessage } from "../../src/domain/events.js";

const make = (id: number, kind: "created" | "updated"): FeedMessage => ({ kind, event: { id, channelId: "default", type: "progress", key: "k", createdAt: 0, updatedAt: id, payload: { label: "x", status: "active" } } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createThrottler", () => {
  it("passes 'created' through immediately", () => {
    const send = vi.fn();
    const t = createThrottler(send, 100);
    t(make(1, "created"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid 'updated' for the same id, flushing the latest", () => {
    const send = vi.fn();
    const t = createThrottler(send, 100);
    t(make(7, "updated"));
    t(make(7, "updated"));
    t(make(7, "updated"));
    expect(send).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].event.id).toBe(7);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run tests/realtime/throttle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `src/realtime/throttle.ts`**

```ts
import type { FeedMessage } from "../domain/events.js";

/**
 * Wraps a send function: 'created' messages pass through immediately;
 * 'updated' messages are coalesced per event id and flushed at most once
 * per `intervalMs`, always sending the latest state for each id.
 */
export function createThrottler(send: (m: FeedMessage) => void, intervalMs = 100): (m: FeedMessage) => void {
  const pending = new Map<number, FeedMessage>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    for (const m of pending.values()) send(m);
    pending.clear();
    timer = null;
  };

  return (msg: FeedMessage): void => {
    if (msg.kind === "created") { send(msg); return; }
    pending.set(msg.event.id, msg);
    if (!timer) timer = setTimeout(flush, intervalMs);
  };
}
```

- [ ] **Step 7: Run both realtime tests to verify they pass**

Run: `npx vitest run tests/realtime`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add src/realtime/broadcaster.ts src/realtime/throttle.ts tests/realtime
git commit -m "feat: broadcaster + per-id update throttler"
```

---

## Task 8: Diff helper + FeedService (application layer)

**Files:**
- Create: `src/domain/diff.ts`, `src/feed.ts`
- Test: `tests/feed.test.ts`

- [ ] **Step 1: Write the failing test `tests/feed.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../src/store/db.js";
import { Broadcaster } from "../src/realtime/broadcaster.js";
import { FeedService } from "../src/feed.js";
import { queryEvents } from "../src/store/events.js";
import { DEFAULT_CHANNEL } from "../src/domain/events.js";
import type { FeedMessage, CodePayload } from "../src/domain/events.js";

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
    expect((e.payload as any).mediaId).toBeTruthy();
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/feed.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/domain/diff.ts`**

```ts
import { createTwoFilesPatch } from "diff";

export function computeUnifiedDiff(before: string, after: string, filename = "file"): string {
  return createTwoFilesPatch(filename, filename, before, after, "", "");
}
```

- [ ] **Step 4: Implement `src/feed.ts`**

```ts
import type { Db } from "./store/db.js";
import type { Broadcaster } from "./realtime/broadcaster.js";
import { insertEvent, upsertProgress, appendLog } from "./store/events.js";
import { saveMediaFromBuffer, saveMediaFromPath } from "./store/media-store.js";
import { computeUnifiedDiff } from "./domain/diff.js";
import type { FeedEvent, NotePayload, ProgressPayload } from "./domain/events.js";

export class FeedService {
  constructor(
    private readonly db: Db,
    private readonly bus: Broadcaster,
    private readonly mediaDir: string,
  ) {}

  private created(event: FeedEvent): FeedEvent {
    this.bus.broadcast({ kind: "created", event });
    return event;
  }

  private emit(created: boolean, event: FeedEvent): FeedEvent {
    this.bus.broadcast({ kind: created ? "created" : "updated", event });
    return event;
  }

  showImage(p: { channelId: string; path?: string; data?: string; mimeType?: string; caption?: string }): FeedEvent {
    if (!p.path && !p.data) throw new Error("show_image requires either 'path' or 'data'.");
    const media = p.data
      ? saveMediaFromBuffer(this.mediaDir, Buffer.from(p.data, "base64"), p.mimeType ?? "image/png")
      : saveMediaFromPath(this.mediaDir, p.path!, p.mimeType);
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "image",
        payload: { mediaId: media.mediaId, mime: media.mime, caption: p.caption, width: media.width, height: media.height },
      }),
    );
  }

  postNote(p: { channelId: string; markdown: string; level?: NotePayload["level"]; title?: string }): FeedEvent {
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "note",
        payload: { markdown: p.markdown, level: p.level ?? "info", title: p.title },
      }),
    );
  }

  updateProgress(p: { channelId: string; key: string; label: string; percent?: number; status?: ProgressPayload["status"] }): FeedEvent {
    const { event, created } = upsertProgress(this.db, {
      channelId: p.channelId,
      key: p.key,
      payload: { label: p.label, percent: p.percent, status: p.status ?? "active" },
    });
    return this.emit(created, event);
  }

  showCode(p: { channelId: string; code: string; language?: string; filename?: string; caption?: string }): FeedEvent {
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "code",
        payload: { mode: "code", code: p.code, language: p.language, filename: p.filename, caption: p.caption },
      }),
    );
  }

  showDiff(p: { channelId: string; diff?: string; before?: string; after?: string; filename?: string; language?: string }): FeedEvent {
    const diff = p.diff ?? computeUnifiedDiff(p.before ?? "", p.after ?? "", p.filename ?? "file");
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "code",
        payload: { mode: "diff", diff, language: p.language, filename: p.filename },
      }),
    );
  }

  addLink(p: { channelId: string; url: string; title?: string; description?: string }): FeedEvent {
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "link",
        payload: { url: p.url, title: p.title, description: p.description },
      }),
    );
  }

  appendLog(p: { channelId: string; key: string; text: string; title?: string }): FeedEvent {
    const { event, created } = appendLog(this.db, p);
    return this.emit(created, event);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/feed.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/diff.ts src/feed.ts tests/feed.test.ts
git commit -m "feat: FeedService application layer + unified diff helper"
```

---

## Task 9: HTTP read API (`/api/events`, `/media/:id`)

**Files:**
- Create: `src/http/events-api.ts`, `src/http/media.ts`
- Test: `tests/http/read-api.test.ts`

- [ ] **Step 1: Write the failing test `tests/http/read-api.test.ts`**

```ts
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
    expect(res.body.events.map((e: any) => e.payload.markdown)).toEqual(["one", "two"]);
  });

  it("supports the `after` cursor", async () => {
    const a = feed.postNote({ channelId: DEFAULT_CHANNEL, markdown: "one" });
    feed.postNote({ channelId: DEFAULT_CHANNEL, markdown: "two" });
    const res = await request(app).get(`/api/events?after=${a.id}`);
    expect(res.body.events.map((e: any) => e.payload.markdown)).toEqual(["two"]);
  });
});

describe("GET /media/:id", () => {
  it("serves a stored image and 404s unknown ids", async () => {
    const e = feed.showImage({ channelId: DEFAULT_CHANNEL, data: PNG, mimeType: "image/png" });
    const id = (e.payload as any).mediaId as string;
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/http/read-api.test.ts`
Expected: FAIL — routers not found.

- [ ] **Step 3: Implement `src/http/events-api.ts`**

```ts
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
```

- [ ] **Step 4: Implement `src/http/media.ts`**

```ts
import { Router } from "express";
import { join } from "node:path";
import { existsSync } from "node:fs";

export function mediaRouter(mediaDir: string): Router {
  const r = Router();
  r.get("/:id", (req, res) => {
    const id = req.params.id;
    if (id.includes("/") || id.includes("\\") || id.includes("..")) { res.status(400).end(); return; }
    const file = join(mediaDir, id);
    if (!existsSync(file)) { res.status(404).end(); return; }
    res.sendFile(file);
  });
  return r;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/http/read-api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/http/events-api.ts src/http/media.ts tests/http/read-api.test.ts
git commit -m "feat: HTTP read API (events + media serving)"
```

---

## Task 10: MCP server & the 7 tools

**Files:**
- Create: `src/mcp/server.ts`
- Test: `tests/mcp/tools.test.ts` (drives the MCP server through an in-memory linked transport)

- [ ] **Step 1: Write the failing test `tests/mcp/tools.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb, type Db } from "../../src/store/db.js";
import { Broadcaster } from "../../src/realtime/broadcaster.js";
import { FeedService } from "../../src/feed.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { queryEvents } from "../../src/store/events.js";

let dir: string; let db: Db; let client: Client;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "acb-"));
  db = openDb(join(dir, "db.sqlite"));
  const feed = new FeedService(db, new Broadcaster(), join(dir, "media"));
  const server = createMcpServer(feed);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
});
afterEach(async () => { await client.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("MCP tools", () => {
  it("lists all seven tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["add_link", "append_log", "post_note", "show_code", "show_diff", "show_image", "update_progress"],
    );
  });

  it("post_note persists a note", async () => {
    await client.callTool({ name: "post_note", arguments: { markdown: "hi", level: "important" } });
    const events = queryEvents(db, {});
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("note");
    expect((events[0].payload as any).level).toBe("important");
  });

  it("update_progress upserts by key (one row, latest percent)", async () => {
    await client.callTool({ name: "update_progress", arguments: { key: "b", label: "Build", percent: 20 } });
    await client.callTool({ name: "update_progress", arguments: { key: "b", label: "Build", percent: 75 } });
    const events = queryEvents(db, {});
    expect(events.length).toBe(1);
    expect((events[0].payload as any).percent).toBe(75);
  });

  it("show_image without path or data returns a tool error", async () => {
    const res: any = await client.callTool({ name: "show_image", arguments: { caption: "x" } });
    expect(res.isError).toBe(true);
  });
});
```

> The SDK ships `InMemoryTransport` for exactly this kind of client↔server test — no sockets, fully deterministic. (Network transport is exercised in Task 11.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/mcp/tools.test.ts`
Expected: FAIL — `createMcpServer` not found.

- [ ] **Step 3: Implement `src/mcp/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeedService } from "../feed.js";
import { DEFAULT_CHANNEL } from "../domain/events.js";

export function createMcpServer(feed: FeedService): McpServer {
  const server = new McpServer({ name: "aicommsbridge", version: "0.1.0" });
  const channel = z.string().min(1).optional();
  const ack = (id: number, ch: string) => ({ content: [{ type: "text" as const, text: `Posted event #${id} to channel "${ch}".` }] });
  const ch = (c?: string) => c ?? DEFAULT_CHANNEL;

  server.registerTool("show_image", {
    title: "Show image / screenshot",
    description: "Display an image in the feed. Provide a local file 'path' OR base64 'data' (with 'mimeType').",
    inputSchema: { path: z.string().optional(), data: z.string().optional(), mimeType: z.string().optional(), caption: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.showImage({ channelId: ch(a.channel), path: a.path, data: a.data, mimeType: a.mimeType, caption: a.caption });
    return ack(e.id, e.channelId);
  });

  server.registerTool("post_note", {
    title: "Post a note",
    description: "Post a markdown note. Use level 'important'|'warn'|'error' to make it stand out and notify.",
    inputSchema: { markdown: z.string(), level: z.enum(["info", "important", "success", "warn", "error"]).optional(), title: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.postNote({ channelId: ch(a.channel), markdown: a.markdown, level: a.level, title: a.title });
    return ack(e.id, e.channelId);
  });

  server.registerTool("update_progress", {
    title: "Update progress",
    description: "Create or update a progress card identified by 'key'. Re-call with the same key to update it in place.",
    inputSchema: { key: z.string(), label: z.string(), percent: z.number().min(0).max(100).optional(), status: z.enum(["active", "done", "error"]).optional(), channel },
  }, async (a) => {
    const e = feed.updateProgress({ channelId: ch(a.channel), key: a.key, label: a.label, percent: a.percent, status: a.status });
    return ack(e.id, e.channelId);
  });

  server.registerTool("show_code", {
    title: "Show code",
    description: "Display a syntax-highlighted code snippet.",
    inputSchema: { code: z.string(), language: z.string().optional(), filename: z.string().optional(), caption: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.showCode({ channelId: ch(a.channel), code: a.code, language: a.language, filename: a.filename, caption: a.caption });
    return ack(e.id, e.channelId);
  });

  server.registerTool("show_diff", {
    title: "Show diff",
    description: "Display a diff. Provide a unified 'diff' string OR 'before' and 'after' text.",
    inputSchema: { diff: z.string().optional(), before: z.string().optional(), after: z.string().optional(), filename: z.string().optional(), language: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.showDiff({ channelId: ch(a.channel), diff: a.diff, before: a.before, after: a.after, filename: a.filename, language: a.language });
    return ack(e.id, e.channelId);
  });

  server.registerTool("add_link", {
    title: "Add link",
    description: "Add a clickable link card (deploy preview, PR, localhost, etc.).",
    inputSchema: { url: z.string().url(), title: z.string().optional(), description: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.addLink({ channelId: ch(a.channel), url: a.url, title: a.title, description: a.description });
    return ack(e.id, e.channelId);
  });

  server.registerTool("append_log", {
    title: "Append to a log stream",
    description: "Append text to a named log stream identified by 'key'. Re-call with the same key to keep appending.",
    inputSchema: { key: z.string(), text: z.string(), title: z.string().optional(), channel },
  }, async (a) => {
    const e = feed.appendLog({ channelId: ch(a.channel), key: a.key, text: a.text, title: a.title });
    return ack(e.id, e.channelId);
  });

  return server;
}
```

> The SDK wraps each tool callback: a thrown error becomes a tool result with `isError: true` (covered by the `show_image` test). `inputSchema` is a zod **raw shape** (a plain object of validators), which the SDK turns into the advertised JSON Schema.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/mcp/tools.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp/tools.test.ts
git commit -m "feat: MCP server with seven feed tools"
```

---

## Task 11: HTTP app wiring + hub lifecycle + CLI (end-to-end)

**Files:**
- Create: `src/http/app.ts`, `src/hub.ts`, `src/index.ts`
- Test: `tests/e2e/hub.test.ts`

- [ ] **Step 1: Write the failing test `tests/e2e/hub.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHub, type Hub } from "../../src/hub.js";

let dir: string; let hub: Hub; let base: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "acb-"));
  hub = await startHub({ port: 0, dataDir: dir, dbPath: join(dir, "db.sqlite"), mediaDir: join(dir, "media") });
  base = `http://127.0.0.1:${hub.port}`;
});
afterEach(async () => { await hub.close(); rmSync(dir, { recursive: true, force: true }); });

async function mcpClient(): Promise<Client> {
  const client = new Client({ name: "e2e", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return client;
}

describe("hub end-to-end", () => {
  it("tool call persists and is readable via REST", async () => {
    const client = await mcpClient();
    await client.callTool({ name: "post_note", arguments: { markdown: "live!" } });
    await client.close();
    const res = await fetch(`${base}/api/events`);
    const body = await res.json();
    expect(body.events.at(-1).payload.markdown).toBe("live!");
  });

  it("tool call is pushed live over the WebSocket", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${hub.port}/ws`);
    const got = new Promise<any>((resolve) => ws.on("message", (d) => resolve(JSON.parse(d.toString()))));
    await new Promise<void>((r) => ws.on("open", () => r()));
    const client = await mcpClient();
    await client.callTool({ name: "post_note", arguments: { markdown: "ping" } });
    const msg = await got;
    expect(msg.kind).toBe("created");
    expect(msg.event.payload.markdown).toBe("ping");
    ws.close();
    await client.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/e2e/hub.test.ts`
Expected: FAIL — `startHub` not found.

- [ ] **Step 3: Implement `src/http/app.ts`**

```ts
import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Db } from "../store/db.js";
import type { FeedService } from "../feed.js";
import { createMcpServer } from "../mcp/server.js";
import { eventsRouter } from "./events-api.js";
import { mediaRouter } from "./media.js";

export function createApp(opts: { db: Db; feed: FeedService; mediaDir: string; webDir?: string }): Express {
  const app = express();
  app.use(express.json({ limit: "32mb" })); // base64 screenshots can be large

  app.use("/api", eventsRouter(opts.db));
  app.use("/media", mediaRouter(opts.mediaDir));

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post("/mcp", async (req, res) => {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    let transport = sid ? transports[sid] : undefined;

    if (!transport) {
      if (sid || !isInitializeRequest(req.body)) {
        res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session" }, id: null });
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { transports[id] = transport!; },
      });
      transport.onclose = () => { if (transport!.sessionId) delete transports[transport!.sessionId]; };
      await createMcpServer(opts.feed).connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  });

  const sessionRequest = async (req: express.Request, res: express.Response) => {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    const transport = sid ? transports[sid] : undefined;
    if (!transport) { res.status(400).send("Invalid or missing session ID"); return; }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", sessionRequest);
  app.delete("/mcp", sessionRequest);

  if (opts.webDir) app.use(express.static(opts.webDir));
  return app;
}
```

> Security note: the hub binds to `127.0.0.1` only (see `hub.ts`), so it is unreachable off-host. That is the v1 boundary; DNS-rebinding protection can be enabled later for shared deployments.

- [ ] **Step 4: Implement `src/hub.ts`**

```ts
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "./store/db.js";
import { Broadcaster } from "./realtime/broadcaster.js";
import { attachWebsocket } from "./realtime/ws.js";
import { FeedService } from "./feed.js";
import { createApp } from "./http/app.js";
import type { Config } from "./config.js";

export interface Hub {
  port: number;
  close: () => Promise<void>;
}

export function startHub(config: Config, webDir?: string): Promise<Hub> {
  const db = openDb(config.dbPath);
  const bus = new Broadcaster();
  const feed = new FeedService(db, bus, config.mediaDir);
  const app = createApp({ db, feed, mediaDir: config.mediaDir, webDir });
  const httpServer: Server = createServer(app);
  const wss = attachWebsocket(httpServer, bus);

  return new Promise((resolve) => {
    httpServer.listen(config.port, "127.0.0.1", () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        port,
        close: () =>
          new Promise<void>((res) => {
            wss.close();
            httpServer.close(() => { db.close(); res(); });
          }),
      });
    });
  });
}
```

- [ ] **Step 5: Implement `src/index.ts`**

```ts
#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { startHub } from "./hub.js";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist");

startHub(loadConfig(), webDir).then((hub) => {
  // eslint-disable-next-line no-console
  console.log(`AICommsBridge hub: http://127.0.0.1:${hub.port}  (UI: /, MCP: /mcp)`);
  const shutdown = () => hub.close().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/e2e/hub.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/http/app.ts src/hub.ts src/index.ts tests/e2e/hub.test.ts
git commit -m "feat: wire hub (HTTP + MCP + WS) with end-to-end coverage"
```

---

## Task 12: README & manual smoke test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# AICommsBridge

A local, MCP-driven progress feed. Start the hub, open the tab, and let an AI agent push
screenshots, notes, progress, code/diffs, links, and logs to one place.

## Run

```bash
npm install
npm run build:web      # build the UI bundle (see the web-ui plan)
npm run start:dev      # start the hub (tsx) on http://127.0.0.1:4319
```

Open http://127.0.0.1:4319 in a browser.

## Connect an MCP client

Point any Streamable-HTTP-capable MCP client at:

```
http://127.0.0.1:4319/mcp
```

## Tools

`show_image`, `post_note`, `update_progress`, `show_code`, `show_diff`, `add_link`, `append_log`.

## Config

- `AICB_PORT` (default `4319`)
- `AICB_DATA_DIR` (default `~/.aicommsbridge`)

Data lives in `$AICB_DATA_DIR/db.sqlite` and `$AICB_DATA_DIR/media/`.
````

- [ ] **Step 2: Manual smoke test**

Run: `npm run start:dev`
Then, in another shell, drive one tool via curl to confirm the MCP endpoint is alive (initialize handshake):
```bash
curl -sS -X POST http://127.0.0.1:4319/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```
Expected: a JSON-RPC result with `serverInfo.name = "aicommsbridge"` and an `mcp-session-id` response header.
Then `curl http://127.0.0.1:4319/api/events` returns `{"events":[...]}`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README for hub server"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** persistence (Tasks 3–5), media (6), all 7 tools (10), Streamable HTTP MCP (10–11), REST read + backfill cursor (4, 9), WS live push (7, 11), channel keying from day one (`channel_id` on every insert, Task 4), error handling (8–10), 127.0.0.1 boundary (11). Throttle/backpressure (7). ✔
- **Placeholder scan:** every code/test step contains complete code; no TBD/TODO. ✔
- **Type consistency:** `FeedEvent`, `FeedMessage`, and payload types are defined once in `src/domain/events.ts` and imported everywhere; store functions (`insertEvent`, `upsertProgress`, `appendLog`, `queryEvents`) keep identical signatures across Tasks 4, 5, 8, 9, 11. ✔
- **Deviation from spec:** none for the server. (The UI plan swaps `shiki` for `highlight.js` — see that plan.)
````
