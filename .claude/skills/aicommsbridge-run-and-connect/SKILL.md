---
name: aicommsbridge-run-and-connect
description: "Use when starting the local AICommsBridge hub (~/coding/AICommsBridge) and connecting an MCP client to it — boot the hub, drive its 7 tools, verify the live feed in a browser, and stop it cleanly (incl. the tsx child-PID gotcha)."
---

# Run & connect to the AICommsBridge hub

AICommsBridge (`~/coding/AICommsBridge`, Node 22, TS ESM) is a local MCP-driven progress feed: an agent pushes cards (image / note / progress / code / diff / link / log) over MCP, and a browser tab renders them live over WebSocket. SQLite + media persist across restarts.

## Start the hub (persistent, default config)
```bash
cd ~/coding/AICommsBridge
nohup node_modules/.bin/tsx src/index.ts > /tmp/acb-hub.log 2>&1 &
# wait for banner: "AICommsBridge hub: http://127.0.0.1:4319  (UI: /, MCP: /mcp)"
```
- Default port **4319** (`AICB_PORT`); data dir **~/.aicommsbridge** (`AICB_DATA_DIR`) → `db.sqlite` + `media/`, survives restarts.
- `start:dev` (tsx) needs no server build, but the **web bundle must exist** (`npm run build:web` → `web/dist/`). Prod path: `npm run build && npm start` (builds `dist/` too).

## Endpoints
- UI: `http://127.0.0.1:4319/` (the tab the user keeps open)
- MCP (Streamable HTTP): `http://127.0.0.1:4319/mcp`
- REST history: `GET /api/events?after=<id>`; media: `GET /media/:id`; live: `/ws`
- Use the `read` tool (not curl — curl/wget are blocked) for HTTP checks.

## Connect a real MCP client
The SDK must resolve from repo `node_modules`, so put the script in the **repo root**, then delete it to keep the tree clean:
```js
// .connect.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "x", version: "0" });
await c.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:4319/mcp")));
console.log((await c.listTools()).tools.map(t => t.name));
await c.callTool({ name: "post_note", arguments: { markdown: "hi", level: "important" } });
await c.close();
```
`node .connect.mjs && rm .connect.mjs`

## The 7 tools
- `show_image` — `path` (local file) OR `data`+`mimeType` (base64); optional `caption`
- `post_note` — `markdown`; optional `title`, `level` ('important'|'warn'|'error' → stands out + notifies)
- `update_progress` — `key` (upsert **in place**), `label`, `percent`, `status`
- `show_code` — `code`, `language`; optional `filename`
- `show_diff` — unified `diff` string OR `before`+`after`; optional `filename`
- `add_link` — `url`; optional `title`, `description`
- `append_log` — `key` (append **in place**), `text` (capped ~1000 lines)

## Verify in a browser (optional)
Open `http://127.0.0.1:4319/`; via the browser tool use `tab.evaluate`, not bare `document` (the `run` body is the puppeteer context). Check `.conn` text == `"live"` and `.feed .card` count.

## Stop it — PID gotcha
`tsx` spawns a **child** node process that is the actual listener, so `$!` captures the wrapper, not the server. Stop reliably with:
```bash
pkill -f "tsx src/index.ts"     # or kill the PID from: lsof -iTCP:4319 -sTCP:LISTEN -n -P
```
