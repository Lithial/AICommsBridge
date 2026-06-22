# AICommsBridge — `ask_user` Two-Way Tool

- **Date:** 2026-06-22
- **Status:** Approved
- **Topic:** An MCP tool that lets an agent pause and ask the user a question, then blocks until the user answers via the feed UI.

---

## 1. Goal

**Demoable success:** With the hub running and the tab open, an agent calls `ask_user` with a question and optional options/placeholder. A live interactive card appears in the feed. The user answers (clicks a button, types text, or approves/rejects). The agent's tool call returns `{ answer, requestId }` and the card flips to a read-only answered state — all without the agent polling and without the page reloading.

---

## 2. Load-bearing decision

**The agent waits via a hanging HTTP connection (long-poll).** The MCP tool handler `await`s an in-memory `Promise`; `POST /api/respond/:requestId` resolves it. This is the simplest correct model for a local single-user hub: no polling, no SSE stream, instant delivery, zero extra agent-side logic.

Consequence: pending questions are **not durable**. A hub restart drops the map; the agent's connection errors and it can re-ask if it wants. This is acceptable — the spec explicitly defers persistence to a later phase.

---

## 3. Contract table

### MCP tool

```ts
ask_user({
  question:    string,       // required — shown as the card title
  options?:    string[],     // present → multiple-choice buttons
  placeholder?: string,      // present, no options → free-text input
  // neither options nor placeholder → Approve / Reject buttons
  channel?:    string,       // defaults to "default"
})
// returns: { answer: string, requestId: string }
```

Mode is inferred from inputs (mutually exclusive; `options` wins if both supplied):
| options | placeholder | mode |
|---|---|---|
| present | — | multiple choice |
| absent | present | free text |
| absent | absent | approval |

### Event payload (`type: "ask"`)

```ts
{
  question:    string,
  options:     string[] | null,
  placeholder: string | null,
  requestId:   string,        // uuid — stable key for /api/respond
  answer:      string | null, // null = pending
  answeredAt:  number | null, // epoch ms, null = pending
}
```

### HTTP endpoint

```
POST /api/respond/:requestId
Body:  { answer: string }
200:   { ok: true }
400:   { error: "answer required" }
404:   { error: "not found" }   // unknown or already-answered requestId
```

### FeedService additions

```ts
feed.askUser(params): Promise<string>
  // inserts ask event, registers pending promise, returns promise of the answer

feed.respond(requestId, answer): { found: boolean }
  // resolves promise, updates SQLite row, broadcasts WS `updated`, removes from map
```

---

## 4. Seam claims (acceptance criteria)

1. Calling `ask_user` over MCP inserts an `ask` event in SQLite with `answer: null` and broadcasts it over WS before the tool call returns a result.
2. `GET /api/events` includes the `ask` event with `answer: null` while pending.
3. `POST /api/respond/:requestId` with a valid id and answer: resolves the hanging tool call within one event loop tick; the tool returns `{ answer, requestId }`; the SQLite row has `answer` and `answeredAt` filled in; a WS `updated` message is broadcast.
4. A second `POST /api/respond/:requestId` to the same (now-answered) id returns 404.
5. Two concurrent `ask_user` calls produce two independent cards, each resolvable independently in any order.
6. `AskCard` renders three distinct modes: buttons for multiple choice, textarea+Submit for free text, Approve/Reject for approval. In answered state it renders the answer text and answeredAt timestamp; no interactive controls remain.
7. Clicking an option in the UI disables the card immediately; on a 404/network error the card re-enables and shows an inline error message.

---

## 5. Architecture

```
Agent calls ask_user(...)
  → FeedService.askUser(): insert ask event → persist + broadcast WS
  → store Promise resolve in pendingRequests[requestId]
  → tool handler awaits promise (HTTP connection hangs)

Browser receives WS `created` → renders AskCard (pending state)
  → user interacts → browser POST /api/respond/:requestId { answer }
  → FeedService.respond(): resolve promise, UPDATE events row, broadcast WS `updated`
  → tool handler returns { answer, requestId }

Browser receives WS `updated` → AskCard flips to answered state
```

`pendingRequests` is a `Map<string, (answer: string) => void>` owned by `FeedService`. It is never persisted. Hub restart clears it; the agent receives a transport error.

---

## 6. Files to create / modify

| File | Change |
|---|---|
| `src/domain/events.ts` | Add `"ask"` to `EVENT_TYPES`; add `askPayloadSchema` + `AskPayload` |
| `src/feed.ts` | Add `pendingRequests` map; add `askUser()` and `respond()` methods |
| `src/store/events.ts` | Add `updateAskAnswer(db, id, answer, answeredAt)` |
| `src/mcp/tools/ask-user.ts` | New tool file |
| `src/mcp/server.ts` | Register `ask_user` tool |
| `src/http/events-api.ts` | Add `POST /api/respond/:requestId` route |
| `web/src/cards/AskCard.tsx` | New card component |
| `web/src/cards/EventCard.tsx` | Dispatch on `type === "ask"` → `AskCard` |
| `web/src/styles.css` | `.ask-*` styles for pending/answered states and input modes |
| `tests/mcp/ask-user.test.ts` | Integration test |

---

## 7. Error handling

| Scenario | Behaviour |
|---|---|
| `POST /api/respond` unknown/already-answered id | 404 `{ error: "not found" }` |
| `POST /api/respond` missing answer body | 400 `{ error: "answer required" }` |
| Two browser tabs race to answer same card | First wins; second gets 404; first tab's WS update arrives on both |
| Hub restarts while tool call is pending | Agent connection drops → MCP transport error; card stays in feed as unanswered history |
| Invalid `ask_user` input (missing question, etc.) | zod rejects → MCP tool error; nothing persisted |

---

## 8. Testing strategy

- **Unit — `feed.respond()`:** resolves the promise with the answer; updates the event row; returns `{ found: false }` for an unknown id; a second call to the same id returns `{ found: false }`.
- **Unit — `AskCard`:** renders multiple-choice buttons, free-text textarea, and approve/reject based on payload; answered state renders answer badge + no controls; submit disables card immediately; re-enables on error response.
- **Integration:** boot hub on ephemeral port; call `ask_user` via real MCP SDK client; assert ask event in `/api/events` with `answer: null`; `POST /api/respond/:requestId`; assert tool call resolves with correct answer; assert event in `/api/events` has answer filled in.

---

## 9. Out of scope

- Durable pending requests (survive hub restart)
- Timeout / default-answer option
- One-at-a-time question queuing
- Rich content in the question (markdown, images)
- Answer validation on the server (any non-empty string is accepted)
