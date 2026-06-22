---
name: aicommsbridge-tools
description: "Use when an MCP client or agent is driving an AICommsBridge progress feed and needs to choose among its 9 tools (show_image, post_note, update_progress, show_code, show_diff, add_link, append_log, ask_user, clear_feed), pass their exact arguments, and apply the upsert-by-key / append-by-key / blocking-ask patterns. Pairs with aicommsbridge-run-and-connect (which boots/connects/stops the hub)."
---

# Driving an AICommsBridge progress feed

AICommsBridge is a local MCP server that renders a **live progress feed** in a browser tab. Every tool call follows **validate -> persist (SQLite/media) -> broadcast (WebSocket)**, so each call appears in the open tab instantly and survives hub/tab restarts. To boot, connect, or stop the hub see the **`aicommsbridge-run-and-connect`** skill — this skill is about **using the 9 tools well** once connected.

## Connection
Registered in the repo's `.mcp.json` as a Streamable-HTTP server (`type: "http"`):
- `http://127.0.0.1:4500/mcp` (single canonical port — native and Docker both use 4500)

## Channels
Every tool accepts an optional **`channel`** string (default `"default"`). The UI shows a tab bar when two or more channels exist — each tab filters to that channel's cards. Use distinct channel names per project so items stay separated (e.g. `channel: "my-project"`).

## Stateful tools (upsert/append by key)
Two tools update a card **in place** when re-called with the same key; a new key creates a new card:
- `update_progress` — upserts a progress bar
- `append_log` — appends to a log stream (capped at ~1000 lines)

All other tools **append a new card** on every call.

## The 9 tools

| Tool | Required | Optional | Reach for it when |
|---|---|---|---|
| `post_note` | `markdown` | `level` (`info`\|`important`\|`success`\|`warn`\|`error`), `title`, `channel` | Status updates, decisions, milestones. `important`/`warn`/`error` **stand out and notify**. |
| `update_progress` | `key`, `label` | `percent` (0–100), `status` (`active`\|`done`\|`error`), `channel` | A task's progress bar. Re-call the same `key` to advance/finish it in place. |
| `append_log` | `key`, `text` | `title`, `channel` | Streaming command/build/test output. Same `key` keeps appending to one block. |
| `show_code` | `code` | `language`, `filename`, `caption`, `channel` | A syntax-highlighted snippet. |
| `show_diff` | `diff` **or** `before`+`after` | `filename`, `language`, `channel` | A change. Pass a unified `diff` string, or `before`/`after` and the hub computes the diff. |
| `add_link` | `url` (must be a valid URL) | `title`, `description`, `channel` | A clickable card: PR, deploy preview, localhost, docs. |
| `show_image` | `path` **or** `data`+`mimeType` | `caption`, `channel` | A screenshot/image. `path` = file on the **hub's** filesystem; `data` = base64 bytes. |
| `ask_user` | `question` | `options` (string[]), `placeholder`, `channel` | **Block until the user answers.** Three modes: `options` → choice buttons; `placeholder` (no options) → free-text input; neither → Approve/Reject. Returns `{ answer, requestId }`. |
| `clear_feed` | — | `channel` | Delete cards. Omit `channel` to wipe all channels; pass one to clear only that channel. **Destructive.** |

## ask_user in detail

```
ask_user({ question: "Deploy to production?", options: ["yes", "no"], channel: "my-project" })
// → blocks until the user clicks in the browser, then returns the chosen answer as text
```

- The tool call **hangs** until the user clicks an option, submits text, or clicks Approve/Reject in the feed UI.
- Pending questions are **in-memory only** — a hub restart drops them. The agent gets a transport error and can re-ask.
- Multiple concurrent `ask_user` calls are fully independent; the user can answer them in any order.
- **omp limitation:** calling `ask_user` from within the same omp session that is rendering the feed creates a deadlock — the omp harness times out before the user can answer. Use it from an external MCP client (Claude Code, another agent session) that can genuinely block.

## Playbook: narrate a task end to end

1. **Open**: `update_progress { key: "build", label: "Building", percent: 0, status: "active", channel: "my-project" }`
2. **Stream output**: `append_log { key: "build-log", text: "<chunk>\n", channel: "my-project" }` (same key per log stream)
3. **Decision gate**: `ask_user { question: "Tests passed. Deploy?", options: ["Deploy", "Abort"], channel: "my-project" }` → blocks until answered
4. **Milestones**: `post_note { markdown: "Deployed ✓", level: "success", channel: "my-project" }`
5. **Show work**: `show_diff { before, after, filename, channel: "my-project" }` for edits
6. **Finish**: `update_progress { key: "build", label: "Build", percent: 100, status: "done", channel: "my-project" }`

## Gotchas
- **Same key = update in place.** Distinct keys for `update_progress`/`append_log` create separate cards.
- **`show_image` `path` resolves on the hub**, not the client. If the hub runs in Docker, the path must exist *inside the container* — prefer base64 `data` + `mimeType` when client and hub aren't colocated.
- **`post_note` markdown is sanitized** (DOMPurify): scripts/handlers are stripped.
- **Schema is enforced**: `percent` 0–100; `status`/`level` are fixed enums; `add_link` rejects non-URL strings.
- **`clear_feed` without `channel` wipes everything.** Pass a channel to scope the delete.
