# AICommsBridge Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisite:** the hub server plan (`2026-06-17-aicommsbridge-hub-server.md`) is implemented — this UI consumes its `/api/events`, `/media/:id`, and `/ws` endpoints and imports event **types** from `src/domain/events.ts`.

**Goal:** Build the single-tab browser UI: a chat-like feed that loads history via REST, subscribes to live updates over WebSocket (with reconnect + backfill), renders all seven card types, patches in-place updates (progress/log) by id, and raises a notification on important notes.

**Architecture:** Vite + Preact SPA served as static files by the hub. A framework-agnostic core (`FeedStore`, `connectFeed`, `renderMarkdown`, `highlightCode`, `renderDiff`, `maybeNotify`) holds all logic and is unit-tested in isolation; thin Preact components render it. Event TS types are imported **type-only** from the server's `src/domain/events.ts`, so there is one source of truth and zero runtime coupling.

**Tech Stack:** Preact 10, Vite 5, `marked` + `dompurify` (markdown), `highlight.js` (code), a tiny custom unified-diff renderer. Tests with `vitest` (jsdom) + `@testing-library/preact`.

> **Deviation from spec:** the spec named `shiki` for highlighting; this plan uses `highlight.js` instead — it highlights synchronously, which avoids async work inside Preact render and keeps cards pure. Equivalent visual result.

---

## File Structure

```
web/
  index.html
  vite.config.ts
  vitest.config.ts
  tsconfig.json
  src/
    main.tsx            # App: owns FeedStore + connection, renders <Feed>
    types.ts            # type-only re-export of server event types (single source of truth)
    api.ts              # fetchEvents()
    store.ts            # FeedStore: id-keyed map, apply/upsert, list(), lastSeenId()
    ws-client.ts        # connectFeed(): reconnect + pre-subscribe backfill
    markdown.ts         # renderMarkdown(): marked + DOMPurify
    highlight.ts        # highlightCode(): highlight.js with safe fallback
    diff-view.ts        # renderDiff(): unified-diff -> classed HTML
    notify.ts           # maybeNotify(), requestNotifyPermission()
    feed.tsx            # <Feed>: topbar + scrolling list + autoscroll
    cards/
      EventCard.tsx     # dispatch on event.type
      ImageCard.tsx  NoteCard.tsx  ProgressCard.tsx
      CodeCard.tsx   LinkCard.tsx  LogCard.tsx
    styles.css
    test-setup.ts       # testing-library cleanup
```

**Locked decisions:** the store is keyed by `event.id` (so `created` and `updated` are both just `set(id, event)` — idempotent, dedups backfill overlap); `lastSeenId()` drives reconnect backfill; markdown/code/diff are converted to sanitized HTML by pure functions that are tested directly.

---

## Task 1: Web toolchain scaffold

**Files:**
- Modify: `package.json` (add web deps + scripts)
- Create: `web/index.html`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/tsconfig.json`, `web/src/types.ts`, `web/src/test-setup.ts`, `web/src/smoke.test.ts`

- [ ] **Step 1: Add web dependencies and scripts to `package.json`**

Add to `dependencies`:
```json
"preact": "^10.25.0",
"marked": "^12.0.0",
"dompurify": "^3.2.0",
"highlight.js": "^11.10.0"
```
Add to `devDependencies`:
```json
"@preact/preset-vite": "^2.9.0",
"@testing-library/preact": "^3.2.4",
"@testing-library/jest-dom": "^6.6.0",
"jsdom": "^25.0.0",
"vite": "^5.4.0"
```
Add to `scripts`:
```json
"test:web": "vitest run --config web/vitest.config.ts",
"test:all": "npm run test && npm run test:web",
"typecheck:web": "tsc -p web/tsconfig.json --noEmit"
```

- [ ] **Step 2: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AICommsBridge</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [preact()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4319",
      "/media": "http://127.0.0.1:4319",
      "/mcp": "http://127.0.0.1:4319",
      "/ws": { target: "ws://127.0.0.1:4319", ws: true },
    },
  },
});
```

- [ ] **Step 4: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [preact()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
```

- [ ] **Step 5: Create `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 6: Create `web/src/types.ts` and `web/src/test-setup.ts`**

`web/src/types.ts` (single source of truth — types only, erased at build):
```ts
export type {
  FeedEvent,
  FeedMessage,
  EventPayload,
  ImagePayload,
  NotePayload,
  ProgressPayload,
  CodePayload,
  LinkPayload,
  LogPayload,
} from "../../src/domain/events";
```

`web/src/test-setup.ts`:
```ts
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/preact";

afterEach(() => cleanup());
```

- [ ] **Step 7: Write the smoke test `web/src/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("web toolchain", () => {
  it("runs in a jsdom environment", () => {
    expect(typeof document).toBe("object");
    const el = document.createElement("div");
    expect(el.tagName).toBe("DIV");
  });
});
```

- [ ] **Step 8: Run to verify the toolchain works**

Run: `npm install && npm run test:web`
Expected: PASS (1 test) in a jsdom environment.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json web/index.html web/vite.config.ts web/vitest.config.ts web/tsconfig.json web/src/types.ts web/src/test-setup.ts web/src/smoke.test.ts
git commit -m "chore: scaffold web UI toolchain (vite + preact + vitest/jsdom)"
```

---

## Task 2: API client

**Files:**
- Create: `web/src/api.ts`
- Test: `web/src/api.test.ts`

- [ ] **Step 1: Write the failing test `web/src/api.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEvents } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("fetchEvents", () => {
  it("builds the query string and returns the events array", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ events: [{ id: 1 }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const events = await fetchEvents({ after: 5, limit: 100 });
    expect(events).toEqual([{ id: 1 }]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("after=5");
    expect(url).toContain("limit=100");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(fetchEvents()).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- api`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/api.ts`**

```ts
import type { FeedEvent } from "./types";

export async function fetchEvents(params: { after?: number; before?: number; limit?: number } = {}): Promise<FeedEvent[]> {
  const q = new URLSearchParams();
  if (params.after != null) q.set("after", String(params.after));
  if (params.before != null) q.set("before", String(params.before));
  if (params.limit != null) q.set("limit", String(params.limit));
  const res = await fetch(`/api/events?${q.toString()}`);
  if (!res.ok) throw new Error(`fetchEvents failed: ${res.status}`);
  const body = (await res.json()) as { events: FeedEvent[] };
  return body.events;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:web -- api`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/api.test.ts
git commit -m "feat(web): REST events client"
```

---

## Task 3: FeedStore

**Files:**
- Create: `web/src/store.ts`
- Test: `web/src/store.test.ts`

- [ ] **Step 1: Write the failing test `web/src/store.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { FeedStore } from "./store";
import type { FeedEvent } from "./types";

const ev = (id: number, percent: number): FeedEvent => ({
  id, channelId: "default", type: "progress", key: "b", createdAt: id, updatedAt: id,
  payload: { label: "Build", percent, status: "active" },
});

describe("FeedStore", () => {
  it("lists events sorted by id ascending", () => {
    const s = new FeedStore();
    s.upsertMany([ev(3, 1), ev(1, 1), ev(2, 1)]);
    expect(s.list().map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("apply('updated') patches the same id in place", () => {
    const s = new FeedStore();
    s.apply({ kind: "created", event: ev(1, 10) });
    s.apply({ kind: "updated", event: ev(1, 90) });
    expect(s.list().length).toBe(1);
    expect((s.list()[0].payload as any).percent).toBe(90);
  });

  it("lastSeenId returns the max id (0 when empty)", () => {
    const s = new FeedStore();
    expect(s.lastSeenId()).toBe(0);
    s.upsertMany([ev(4, 1), ev(9, 1)]);
    expect(s.lastSeenId()).toBe(9);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- store`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/store.ts`**

```ts
import type { FeedEvent, FeedMessage } from "./types";

export class FeedStore {
  private readonly map = new Map<number, FeedEvent>();

  apply(msg: FeedMessage): void {
    this.map.set(msg.event.id, msg.event);
  }

  upsertMany(events: FeedEvent[]): void {
    for (const e of events) this.map.set(e.id, e);
  }

  list(): FeedEvent[] {
    return [...this.map.values()].sort((a, b) => a.id - b.id);
  }

  lastSeenId(): number {
    let max = 0;
    for (const id of this.map.keys()) if (id > max) max = id;
    return max;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:web -- store`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/store.ts web/src/store.test.ts
git commit -m "feat(web): id-keyed FeedStore with in-place updates"
```

---

## Task 4: WebSocket client (reconnect + backfill)

**Files:**
- Create: `web/src/ws-client.ts`
- Test: `web/src/ws-client.test.ts`

- [ ] **Step 1: Write the failing test `web/src/ws-client.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectFeed, type WsLike } from "./ws-client";
import type { FeedEvent, FeedMessage } from "./types";

class FakeWs implements WsLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => this.onclose?.());
  emit(msg: FeedMessage) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const note = (id: number): FeedEvent => ({ id, channelId: "default", type: "note", key: null, createdAt: id, updatedAt: id, payload: { markdown: "x", level: "info" } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("connectFeed", () => {
  it("backfills from lastSeenId before delivering live messages", async () => {
    const seen: FeedMessage[] = [];
    const backfill = vi.fn(async () => [note(2), note(3)]);
    let socket!: FakeWs;
    connectFeed({
      url: "ws://x/ws",
      onMessage: (m) => seen.push(m),
      getLastSeenId: () => 1,
      backfill,
      wsFactory: () => (socket = new FakeWs()),
    });
    await vi.runOnlyPendingTimersAsync(); // let the async connect() resolve
    expect(backfill).toHaveBeenCalledWith(1);
    socket.onopen?.();
    socket.emit({ kind: "created", event: note(4) });
    expect(seen.map((m) => m.event.id)).toEqual([2, 3, 4]);
  });

  it("reconnects with backoff after a close", async () => {
    const factory = vi.fn(() => new FakeWs());
    const conn = connectFeed({
      url: "ws://x/ws",
      onMessage: () => {},
      getLastSeenId: () => 0,
      backfill: async () => [],
      wsFactory: factory,
      baseDelayMs: 100,
    });
    await vi.runOnlyPendingTimersAsync();
    expect(factory).toHaveBeenCalledTimes(1);
    (factory.mock.results[0].value as FakeWs).onclose?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(factory).toHaveBeenCalledTimes(2);
    conn.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- ws-client`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/ws-client.ts`**

```ts
import type { FeedEvent, FeedMessage } from "./types";

export interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close: () => void;
}

export interface ConnectOpts {
  url: string;
  onMessage: (m: FeedMessage) => void;
  getLastSeenId: () => number;
  backfill: (afterId: number) => Promise<FeedEvent[]>;
  onStatus?: (connected: boolean) => void;
  wsFactory?: (url: string) => WsLike;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface FeedConnection {
  close: () => void;
}

export function connectFeed(opts: ConnectOpts): FeedConnection {
  const factory = opts.wsFactory ?? ((u) => new WebSocket(u) as unknown as WsLike);
  const baseDelay = opts.baseDelayMs ?? 250;
  const maxDelay = opts.maxDelayMs ?? 10000;
  let attempt = 0;
  let closed = false;
  let ws: WsLike | null = null;

  const connect = async (): Promise<void> => {
    if (closed) return;
    // Catch up on anything created while disconnected, before live messages flow.
    try {
      const missed = await opts.backfill(opts.getLastSeenId());
      for (const event of missed) opts.onMessage({ kind: "created", event });
    } catch {
      /* a failed backfill will be retried on the next reconnect cycle */
    }
    if (closed) return;
    ws = factory(opts.url);
    ws.onopen = () => { attempt = 0; opts.onStatus?.(true); };
    ws.onmessage = (ev) => opts.onMessage(JSON.parse(ev.data) as FeedMessage);
    ws.onclose = () => { opts.onStatus?.(false); if (!closed) scheduleReconnect(); };
    ws.onerror = () => ws?.close();
  };

  const scheduleReconnect = (): void => {
    attempt += 1;
    const delay = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
    setTimeout(() => void connect(), delay);
  };

  void connect();
  return { close: () => { closed = true; ws?.close(); } };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:web -- ws-client`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/ws-client.ts web/src/ws-client.test.ts
git commit -m "feat(web): resilient WS client with reconnect + backfill"
```

---

## Task 5: Content renderers (markdown, code, diff)

**Files:**
- Create: `web/src/markdown.ts`, `web/src/highlight.ts`, `web/src/diff-view.ts`
- Test: `web/src/renderers.test.ts`

- [ ] **Step 1: Write the failing test `web/src/renderers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";
import { highlightCode } from "./highlight";
import { renderDiff } from "./diff-view";

describe("renderMarkdown", () => {
  it("renders markdown and strips scripts", () => {
    const html = renderMarkdown("**bold** <script>alert(1)</script>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script>");
  });
});

describe("highlightCode", () => {
  it("returns highlighted html containing the source text", () => {
    const html = highlightCode("const x = 1;", "javascript");
    expect(html).toContain("x");
  });
  it("falls back without throwing for an unknown language", () => {
    expect(() => highlightCode("<a>", "not-a-lang")).not.toThrow();
    expect(highlightCode("<a>", "not-a-lang")).toContain("&lt;a&gt;");
  });
});

describe("renderDiff", () => {
  it("classes added/removed/hunk lines and escapes html", () => {
    const html = renderDiff("@@ -1 +1 @@\n-<old>\n+<new>");
    expect(html).toContain('class="diff-line hunk"');
    expect(html).toContain('class="diff-line del"');
    expect(html).toContain('class="diff-line add"');
    expect(html).toContain("&lt;new&gt;");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- renderers`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `web/src/markdown.ts`**

```ts
import { marked } from "marked";
import DOMPurify from "dompurify";

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
```

- [ ] **Step 4: Implement `web/src/highlight.ts`**

```ts
import hljs from "highlight.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightCode(code: string, language?: string): string {
  try {
    if (language && hljs.getLanguage(language)) return hljs.highlight(code, { language }).value;
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}
```

- [ ] **Step 5: Implement `web/src/diff-view.ts`**

```ts
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDiff(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      const cls =
        line.startsWith("+++") || line.startsWith("---") ? "meta"
        : line.startsWith("@@") ? "hunk"
        : line.startsWith("+") ? "add"
        : line.startsWith("-") ? "del"
        : "ctx";
      return `<span class="diff-line ${cls}">${escapeHtml(line)}</span>`;
    })
    .join("\n");
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm run test:web -- renderers`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add web/src/markdown.ts web/src/highlight.ts web/src/diff-view.ts web/src/renderers.test.ts
git commit -m "feat(web): markdown/code/diff renderers (sanitized)"
```

---

## Task 6: Notifications

**Files:**
- Create: `web/src/notify.ts`
- Test: `web/src/notify.test.ts`

- [ ] **Step 1: Write the failing test `web/src/notify.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { maybeNotify } from "./notify";
import type { FeedEvent } from "./types";

const noteEvent = (level: string): FeedEvent => ({ id: 1, channelId: "default", type: "note", key: null, createdAt: 0, updatedAt: 0, payload: { markdown: "heads up", level: level as any } });

afterEach(() => vi.unstubAllGlobals());

function stubNotification(permission: NotificationPermission) {
  const ctor = vi.fn();
  vi.stubGlobal("Notification", Object.assign(ctor, { permission }));
  return ctor;
}

describe("maybeNotify", () => {
  it("notifies for important notes when the tab is hidden and permission granted", () => {
    const ctor = stubNotification("granted");
    maybeNotify(noteEvent("important"), { hidden: true });
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("does not notify for info-level notes", () => {
    const ctor = stubNotification("granted");
    maybeNotify(noteEvent("info"), { hidden: true });
    expect(ctor).not.toHaveBeenCalled();
  });

  it("does not notify when the tab is visible", () => {
    const ctor = stubNotification("granted");
    maybeNotify(noteEvent("error"), { hidden: false });
    expect(ctor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- notify`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/notify.ts`**

```ts
import type { FeedEvent, NotePayload } from "./types";

const ALERT_LEVELS = new Set(["important", "warn", "error"]);

export function maybeNotify(event: FeedEvent, doc: { hidden: boolean } = document): void {
  if (event.type !== "note") return;
  const payload = event.payload as NotePayload;
  if (!ALERT_LEVELS.has(payload.level)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!doc.hidden) return;
  new Notification(payload.title ?? "AICommsBridge", { body: payload.markdown.slice(0, 140) });
}

export function requestNotifyPermission(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:web -- notify`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/notify.ts web/src/notify.test.ts
git commit -m "feat(web): browser notifications for important notes"
```

---

## Task 7: Card components + dispatcher

**Files:**
- Create: `web/src/cards/ImageCard.tsx`, `NoteCard.tsx`, `ProgressCard.tsx`, `CodeCard.tsx`, `LinkCard.tsx`, `LogCard.tsx`, `EventCard.tsx`
- Test: `web/src/cards/cards.test.tsx`

- [ ] **Step 1: Write the failing test `web/src/cards/cards.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { EventCard } from "./EventCard";
import type { FeedEvent } from "../types";

const base = { id: 1, channelId: "default", key: null, createdAt: 0, updatedAt: 0 };

describe("EventCard", () => {
  it("renders a note as sanitized markdown", () => {
    const e: FeedEvent = { ...base, type: "note", payload: { markdown: "**hi**", level: "important" } };
    const { container } = render(<EventCard event={e} />);
    expect(container.querySelector("strong")?.textContent).toBe("hi");
    expect(container.querySelector(".note-important")).toBeTruthy();
  });

  it("renders a progress bar with the right width", () => {
    const e: FeedEvent = { ...base, type: "progress", payload: { label: "Build", percent: 42, status: "active" } };
    const { container } = render(<EventCard event={e} />);
    expect((container.querySelector(".progress-fill") as HTMLElement).style.width).toBe("42%");
  });

  it("renders an image pointing at /media", () => {
    const e: FeedEvent = { ...base, type: "image", payload: { mediaId: "abc.png", mime: "image/png", caption: "shot" } };
    render(<EventCard event={e} />);
    expect((screen.getByAltText("shot") as HTMLImageElement).getAttribute("src")).toBe("/media/abc.png");
  });

  it("renders a link card", () => {
    const e: FeedEvent = { ...base, type: "link", payload: { url: "https://example.com", title: "Preview" } };
    render(<EventCard event={e} />);
    expect((screen.getByText("Preview").closest("a") as HTMLAnchorElement).href).toContain("example.com");
  });

  it("renders a log with truncation note", () => {
    const e: FeedEvent = { ...base, type: "log", payload: { title: "run", lines: ["a", "b"], truncatedCount: 5 } };
    const { container } = render(<EventCard event={e} />);
    expect(container.querySelector(".log-body")?.textContent).toContain("a\nb");
    expect(container.querySelector(".log-trunc")?.textContent).toContain("5");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- cards`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the card components**

`web/src/cards/NoteCard.tsx`:
```tsx
import { renderMarkdown } from "../markdown";
import type { NotePayload } from "../types";

export function NoteCard({ payload }: { payload: NotePayload }) {
  return (
    <div class={`card note note-${payload.level}`}>
      {payload.title && <div class="card-title">{payload.title}</div>}
      <div class="note-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(payload.markdown) }} />
    </div>
  );
}
```

`web/src/cards/ProgressCard.tsx`:
```tsx
import type { ProgressPayload } from "../types";

export function ProgressCard({ payload }: { payload: ProgressPayload }) {
  return (
    <div class={`card progress status-${payload.status}`}>
      <div class="progress-label">{payload.label}</div>
      {payload.percent != null && (
        <div class="progress-bar"><div class="progress-fill" style={{ width: `${payload.percent}%` }} /></div>
      )}
      <div class="progress-meta">{payload.status}{payload.percent != null ? ` · ${payload.percent}%` : ""}</div>
    </div>
  );
}
```

`web/src/cards/ImageCard.tsx`:
```tsx
import type { ImagePayload } from "../types";

export function ImageCard({ payload }: { payload: ImagePayload }) {
  const src = `/media/${payload.mediaId}`;
  return (
    <div class="card image">
      <a href={src} target="_blank" rel="noreferrer noopener">
        <img src={src} alt={payload.caption ?? "screenshot"} loading="lazy" />
      </a>
      {payload.caption && <div class="card-caption">{payload.caption}</div>}
    </div>
  );
}
```

`web/src/cards/CodeCard.tsx`:
```tsx
import type { CodePayload } from "../types";
import { highlightCode } from "../highlight";
import { renderDiff } from "../diff-view";

export function CodeCard({ payload }: { payload: CodePayload }) {
  if (payload.mode === "diff") {
    return (
      <div class="card code diff">
        {payload.filename && <div class="card-title">{payload.filename}</div>}
        <pre class="diff-block" dangerouslySetInnerHTML={{ __html: renderDiff(payload.diff ?? "") }} />
      </div>
    );
  }
  return (
    <div class="card code">
      {payload.filename && <div class="card-title">{payload.filename}</div>}
      <pre class="code-block"><code dangerouslySetInnerHTML={{ __html: highlightCode(payload.code ?? "", payload.language) }} /></pre>
      {payload.caption && <div class="card-caption">{payload.caption}</div>}
    </div>
  );
}
```

`web/src/cards/LinkCard.tsx`:
```tsx
import type { LinkPayload } from "../types";

export function LinkCard({ payload }: { payload: LinkPayload }) {
  return (
    <a class="card link" href={payload.url} target="_blank" rel="noreferrer noopener">
      <div class="link-title">{payload.title ?? payload.url}</div>
      {payload.description && <div class="link-desc">{payload.description}</div>}
      <div class="link-url">{payload.url}</div>
    </a>
  );
}
```

`web/src/cards/LogCard.tsx`:
```tsx
import { useRef, useEffect } from "preact/hooks";
import type { LogPayload } from "../types";

export function LogCard({ payload }: { payload: LogPayload }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [payload.lines.length]);
  return (
    <div class="card log">
      {payload.title && <div class="card-title">{payload.title}</div>}
      {payload.truncatedCount > 0 && <div class="log-trunc">… {payload.truncatedCount} earlier lines truncated</div>}
      <pre class="log-body" ref={ref}>{payload.lines.join("\n")}</pre>
    </div>
  );
}
```

`web/src/cards/EventCard.tsx`:
```tsx
import type { FeedEvent, ImagePayload, NotePayload, ProgressPayload, CodePayload, LinkPayload, LogPayload } from "../types";
import { ImageCard } from "./ImageCard";
import { NoteCard } from "./NoteCard";
import { ProgressCard } from "./ProgressCard";
import { CodeCard } from "./CodeCard";
import { LinkCard } from "./LinkCard";
import { LogCard } from "./LogCard";

export function EventCard({ event }: { event: FeedEvent }) {
  switch (event.type) {
    case "image": return <ImageCard payload={event.payload as ImagePayload} />;
    case "note": return <NoteCard payload={event.payload as NotePayload} />;
    case "progress": return <ProgressCard payload={event.payload as ProgressPayload} />;
    case "code": return <CodeCard payload={event.payload as CodePayload} />;
    case "link": return <LinkCard payload={event.payload as LinkPayload} />;
    case "log": return <LogCard payload={event.payload as LogPayload} />;
    default: return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:web -- cards`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/cards
git commit -m "feat(web): card components for all seven event types"
```

---

## Task 8: Feed view, App wiring, styles, and end-to-end smoke

**Files:**
- Create: `web/src/feed.tsx`, `web/src/main.tsx`, `web/src/styles.css`
- Test: `web/src/feed.test.tsx`

- [ ] **Step 1: Write the failing test `web/src/feed.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { Feed } from "./feed";
import type { FeedEvent } from "./types";

const note = (id: number, text: string): FeedEvent => ({ id, channelId: "default", type: "note", key: null, createdAt: id, updatedAt: id, payload: { markdown: text, level: "info" } });

describe("Feed", () => {
  it("renders one card per event and shows connection status", () => {
    render(<Feed events={[note(1, "alpha"), note(2, "beta")]} connected={true} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getByText("live")).toBeTruthy();
  });

  it("shows reconnecting when disconnected", () => {
    render(<Feed events={[]} connected={false} />);
    expect(screen.getByText(/reconnecting/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:web -- feed`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web/src/feed.tsx`**

```tsx
import { useRef, useEffect } from "preact/hooks";
import type { FeedEvent } from "./types";
import { EventCard } from "./cards/EventCard";

export function Feed({ events, connected }: { events: FeedEvent[]; connected: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const onScroll = (): void => {
    const el = containerRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView();
  }, [events.length]);

  return (
    <div class="app">
      <header class="topbar">
        <span class="brand">AICommsBridge</span>
        <span class={`conn ${connected ? "on" : "off"}`}>{connected ? "live" : "reconnecting…"}</span>
      </header>
      <div class="feed" ref={containerRef} onScroll={onScroll}>
        {events.map((e) => <EventCard key={e.id} event={e} />)}
        <div ref={endRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:web -- feed`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `web/src/main.tsx`**

```tsx
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { FeedEvent } from "./types";
import { fetchEvents } from "./api";
import { connectFeed, type FeedConnection } from "./ws-client";
import { FeedStore } from "./store";
import { Feed } from "./feed";
import { maybeNotify, requestNotifyPermission } from "./notify";
import "./styles.css";

function App() {
  const [store] = useState(() => new FeedStore());
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let conn: FeedConnection | undefined;
    const refresh = (): void => { if (active) setEvents(store.list()); };

    requestNotifyPermission();
    fetchEvents({ limit: 200 }).then((initial) => {
      if (!active) return;
      store.upsertMany(initial);
      refresh();
      conn = connectFeed({
        url: `ws://${location.host}/ws`,
        getLastSeenId: () => store.lastSeenId(),
        backfill: (after) => fetchEvents({ after }),
        onStatus: (c) => { if (active) setConnected(c); },
        onMessage: (m) => { store.apply(m); maybeNotify(m.event); refresh(); },
      });
    });

    return () => { active = false; conn?.close(); };
  }, []);

  return <Feed events={events} connected={connected} />;
}

render(<App />, document.getElementById("app")!);
```

- [ ] **Step 6: Implement `web/src/styles.css`**

```css
:root {
  --bg: #0f1115; --panel: #171a21; --border: #262b35; --text: #e6e9ef;
  --muted: #9aa4b2; --accent: #4f8cff; --add: #2ea043; --del: #f85149; --warn: #d29922;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; }
.app { display: flex; flex-direction: column; height: 100vh; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel); }
.brand { font-weight: 600; }
.conn { font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.conn.on { color: var(--add); } .conn.off { color: var(--warn); }
.feed { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; max-width: 900px; }
.card-title { font-weight: 600; margin-bottom: 6px; }
.card-caption { color: var(--muted); font-size: 12px; margin-top: 6px; }
.note-important { border-left: 3px solid var(--accent); }
.note-warn { border-left: 3px solid var(--warn); }
.note-error { border-left: 3px solid var(--del); }
.note-success { border-left: 3px solid var(--add); }
.note-body :first-child { margin-top: 0; } .note-body :last-child { margin-bottom: 0; }
.progress-bar { height: 8px; background: #0b0d11; border-radius: 999px; overflow: hidden; margin: 6px 0; }
.progress-fill { height: 100%; background: var(--accent); transition: width .3s ease; }
.progress-meta { color: var(--muted); font-size: 12px; }
.status-done .progress-fill { background: var(--add); }
.status-error .progress-fill { background: var(--del); }
.code-block, .diff-block, .log-body { margin: 0; padding: 10px; background: #0b0d11; border-radius: 8px; overflow-x: auto; font: 12px/1.5 ui-monospace, monospace; }
.log-body { max-height: 320px; overflow-y: auto; white-space: pre-wrap; }
.log-trunc { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
.diff-line { display: block; }
.diff-line.add { color: var(--add); } .diff-line.del { color: var(--del); }
.diff-line.hunk { color: var(--accent); } .diff-line.meta { color: var(--muted); }
.image img { max-width: 100%; border-radius: 8px; display: block; }
.link { display: block; text-decoration: none; color: inherit; }
.link:hover { border-color: var(--accent); }
.link-title { color: var(--accent); font-weight: 600; }
.link-desc { color: var(--muted); font-size: 13px; margin: 2px 0; }
.link-url { color: var(--muted); font-size: 12px; }
```

- [ ] **Step 7: Run the full web suite + typecheck**

Run: `npm run test:web && npm run typecheck:web`
Expected: all web tests PASS, no type errors.

- [ ] **Step 8: Build + manual end-to-end smoke**

Run:
```bash
npm run build:web
npm run start:dev
```
Then open http://127.0.0.1:4319 and, from an MCP client connected to `http://127.0.0.1:4319/mcp` (or the dev UI at http://localhost:5173 with `npm run dev:web` running alongside the hub), call each tool once. Confirm visually:
- [ ] `show_image` renders a screenshot with caption; clicking opens it at `/media/...`.
- [ ] `post_note` (level `important`) renders highlighted; hiding the tab triggers a notification.
- [ ] `update_progress` called twice with the same `key` updates one card in place (bar animates, no duplicate).
- [ ] `show_code` is syntax-highlighted; `show_diff` shows red/green lines.
- [ ] `add_link` renders a clickable card.
- [ ] `append_log` called repeatedly grows one log panel (auto-scrolls to bottom).
- [ ] Restart the hub and reload the tab — full history is still present.
- [ ] Kill/restart the hub while the tab is open — status flips to "reconnecting…", then back to "live" and backfills without a manual reload.

- [ ] **Step 9: Commit**

```bash
git add web/src/feed.tsx web/src/main.tsx web/src/styles.css web/src/feed.test.tsx
git commit -m "feat(web): feed view, app wiring, styles"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** browser tab UI (all tasks), live WS push + reconnect/backfill (Task 4), history via REST (Task 2), in-place progress/log by id (Tasks 3, 7), all six visual card types incl. image/note/progress/code/diff/link/log (Task 7), markdown sanitization (Task 5), notifications for important notes (Task 6), single-feed-but-channel-keyed (store is id-keyed; channel filtering is a later sidebar, data already carries `channelId`). ✔
- **Placeholder scan:** every step has complete code; no TBD/TODO. ✔
- **Type consistency:** all web modules import event types from `web/src/types.ts`, which re-exports the server's `src/domain/events.ts` — one source of truth. `connectFeed`, `FeedStore`, `fetchEvents`, and the card `payload` casts use those exact types. `WsLike` is defined once and reused in the test. ✔
- **Cross-plan consistency:** WS message shape `{ kind, event }` matches the server's `FeedMessage`; `/api/events?after=` and `/media/:id` match the server's routes; `ws://${location.host}/ws` matches the server's `/ws` path. ✔
- **Stated deviation:** `highlight.js` instead of `shiki` (rationale at top). ✔
```
