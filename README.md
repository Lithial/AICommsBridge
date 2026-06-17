# AICommsBridge

A local, MCP-driven progress feed. Start the hub, open the tab, and let an AI agent push
screenshots, notes, progress, code/diffs, links, and logs to one place.

## Run

```bash
npm install
npm run build:web      # build the UI bundle
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
