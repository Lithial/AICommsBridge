---
name: aicommsbridge-run-and-connect
description: "Use when starting the local AICommsBridge hub (~/coding/AICommsBridge) and connecting an MCP client to it — boot the hub via Docker (preferred) or native Node, connect an MCP client, verify the live feed in a browser, and stop it cleanly."
---

# Run & connect to the AICommsBridge hub

AICommsBridge (`~/coding/AICommsBridge`, Node 22, TS ESM) is a local MCP-driven progress feed: an agent pushes cards over MCP, and a browser tab renders them live over WebSocket. SQLite + media persist across restarts.

**Single canonical port: 4500** — used for UI, REST, MCP, and WebSocket in all run modes.

## Start the hub (Docker — preferred)

```bash
cd ~/coding/AICommsBridge
docker compose up -d          # starts with cached image
docker compose up --build -d  # rebuild after source changes (use --no-cache if layers look stale)
```

- UI at `http://127.0.0.1:4500/`
- MCP at `http://127.0.0.1:4500/mcp`
- Data persisted in the `aicommsbridge-data` Docker volume (survives container restarts)

## Start the hub (native Node — dev/testing)

```bash
cd ~/coding/AICommsBridge
npm run build          # builds dist/ and web/dist/
npm start              # node dist/index.js on port 4500
```

Or dev-mode without a server build (web bundle still required):
```bash
npm run build:web      # → web/dist/
node_modules/.bin/tsx src/index.ts
```

Stop native: `pkill -f "node dist/index"` or `pkill -f "tsx src/index.ts"` (tsx spawns a child process — `$!` captures the wrapper only, not the listener).

## Endpoints (all on port 4500)
- **UI**: `http://127.0.0.1:4500/` — the tab the user keeps open
- **MCP** (Streamable HTTP): `http://127.0.0.1:4500/mcp`
- **REST history**: `GET /api/events?after=<id>&channel=<id>`
- **Channels list**: `GET /api/channels`
- **Respond to ask_user**: `POST /api/respond/:requestId  { answer: string }`
- **Media**: `GET /media/:id`
- **WebSocket**: `ws://127.0.0.1:4500/ws`

## `.mcp.json` (already in repo root)
```json
{
  "mcpServers": {
    "aicommsbridge": {
      "type": "http",
      "url": "http://127.0.0.1:4500/mcp"
    }
  }
}
```

## Connect a real MCP client (one-shot verification)

```js
// .connect.mjs — run from repo root, delete after
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "x", version: "0" });
await c.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:4500/mcp")));
console.log((await c.listTools()).tools.map(t => t.name));
// expected: ["add_link","append_log","ask_user","clear_feed","post_note","show_code","show_diff","show_image","update_progress"]
await c.callTool({ name: "post_note", arguments: { markdown: "hello", level: "important" } });
await c.close();
```
`node .connect.mjs && rm .connect.mjs`

## The 9 tools (quick ref)
- `show_image` — `path` (hub filesystem) OR `data`+`mimeType` (base64); `caption`, `channel`
- `post_note` — `markdown`; `title`, `level` (`important`/`warn`/`error` → notifies), `channel`
- `update_progress` — `key` (**upsert in place**), `label`, `percent`, `status`, `channel`
- `show_code` — `code`; `language`, `filename`, `channel`
- `show_diff` — unified `diff` OR `before`+`after`; `filename`, `channel`
- `add_link` — `url`; `title`, `description`, `channel`
- `append_log` — `key` (**append in place**, ~1000 line cap), `text`, `title`, `channel`
- `ask_user` — `question`; `options` (buttons), `placeholder` (free-text), `channel` — **blocks until answered**
- `clear_feed` — `channel` (omit to clear all) — **destructive**

See `aicommsbridge-tools` skill for full argument details, the ask_user blocking contract, and the task-narration playbook.

## Channel tabs
The UI shows a tab bar when two or more channels exist. Pass distinct `channel` values per project to keep feeds separated. Clicking a tab filters to that channel; Clear scopes to the active tab.

## Rebuild after code changes
After editing source: `docker compose up --build -d`. If Docker caches everything and the new code doesn't appear, add `--no-cache`: `docker compose build --no-cache && docker compose up -d`.
