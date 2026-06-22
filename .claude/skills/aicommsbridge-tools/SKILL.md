---
name: aicommsbridge-tools
description: "Use when an MCP client or agent is driving an AICommsBridge progress feed and needs to choose among its 7 tools (show_image, post_note, update_progress, show_code, show_diff, add_link, append_log), pass their exact arguments, and apply the upsert-by-key / append-by-key patterns for live progress. Pairs with aicommsbridge-run-and-connect (which boots/connects/stops the hub)."
---

# Driving an AICommsBridge progress feed

AICommsBridge is a local MCP server that renders a **live progress feed** in a browser tab. Every tool call follows **validate -> persist (SQLite/media) -> broadcast (WebSocket)**, so each call appears in the open tab instantly and survives hub/tab restarts. To boot, connect, or stop the hub see the **`aicommsbridge-run-and-connect`** skill — this skill is about **using the 7 tools well** once connected.

## Connection
Registered in the repo's `.mcp.json` as a Streamable-HTTP server (`type: "http"`):
- Native default: `http://127.0.0.1:4319/mcp`
- Docker: the container listens on 4319 but is published on host **4500** -> use `http://127.0.0.1:4500/mcp`

## Shared rules (apply to every tool)
- Every tool accepts an optional **`channel`** (string, default `"default"`). The UI shows one feed today, but everything is keyed by channel for future multi-channel views.
- Two tools are **stateful by `key`** — re-call with the **same key** to update one card in place; a **new key** makes a new card:
  - `update_progress` upserts a progress card
  - `append_log` appends to one log stream (kept to the most recent ~1000 lines)
- The other five tools **append a new card** every call.
- Each call returns `Posted event #<id> to channel "<ch>".`

## The 7 tools (exact arguments)
| Tool | Required | Optional | Reach for it when |
|---|---|---|---|
| `post_note` | `markdown` | `level` (`info`\|`important`\|`success`\|`warn`\|`error`, default `info`), `title` | Status updates, decisions, milestones. `important`/`warn`/`error` **stand out and notify**. |
| `update_progress` | `key`, `label` | `percent` (0-100), `status` (`active`\|`done`\|`error`, default `active`) | A task's progress bar. Re-call the same `key` to advance/finish it in place. |
| `append_log` | `key`, `text` | `title` | Streaming command / build / test output into one growing block. Same `key` keeps appending. |
| `show_code` | `code` | `language`, `filename`, `caption` | A syntax-highlighted snippet. |
| `show_diff` | `diff` **or** `before`+`after` | `filename`, `language` | A change. Pass a unified `diff` string, or `before`/`after` text and the hub computes the diff. |
| `add_link` | `url` (must be a valid URL) | `title`, `description` | A clickable card: PR, deploy preview, localhost, docs. |
| `show_image` | `path` **or** `data`+`mimeType` | `caption` | A screenshot/image. `path` = a local file **on the hub's filesystem**; `data` = base64 bytes. |

## Playbook: narrate a task end to end
1. **Open** the task: `update_progress { key: "build", label: "Building", percent: 0, status: "active" }`.
2. **Stream output**: `append_log { key: "build", text: "<chunk>\n" }` repeatedly (same key) for command/test logs.
3. **Milestones**: `post_note { markdown: "Tests green", level: "success" }`; use `warn`/`error` for problems so the user is notified.
4. **Show the work**: `show_diff { before, after, filename }` for edits; `show_code { code, language }` for snippets.
5. **Share artifacts**: `add_link { url, title }` for a PR/preview; `show_image { data, mimeType }` for a screenshot.
6. **Finish**: `update_progress { key: "build", label: "Build", percent: 100, status: "done" }` — or `status: "error"` on failure.

## Gotchas
- **Same key = update in place.** Distinct keys for `update_progress`/`append_log` create separate cards; reuse the key deliberately to keep one card/stream alive.
- **`show_image` `path` resolves on the HUB, not the client.** If client and hub are not colocated (e.g. the hub runs in Docker), the `path` must exist *inside the hub's container* — otherwise prefer base64 `data` + `mimeType`.
- **`post_note` markdown is sanitized** (DOMPurify): a safe HTML subset only; scripts/handlers are stripped.
- **`level` defaults to `info`** (quiet). Use `important`/`warn`/`error` only when the card should stand out and fire a notification.
- **Schema is enforced**: `percent` is clamped to 0-100; `status`/`level` are fixed enums; `add_link` rejects non-URL strings. Out-of-set values are refused, not coerced.
