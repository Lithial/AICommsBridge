import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHub, type Hub } from "../../src/hub.js";
import type { FeedEvent, FeedMessage, NotePayload } from "../../src/domain/events.js";

let dir: string; let hub: Hub; let base: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "acb-"));
  hub = await startHub({ host: "127.0.0.1", port: 0, dataDir: dir, dbPath: join(dir, "db.sqlite"), mediaDir: join(dir, "media") });
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
    const body = (await res.json()) as { events: FeedEvent[] };
    expect((body.events.at(-1)!.payload as NotePayload).markdown).toBe("live!");
  });

  it("tool call is pushed live over the WebSocket", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${hub.port}/ws`);
    const { promise: got, resolve: gotResolve } = Promise.withResolvers<FeedMessage>();
    ws.on("message", (d) => gotResolve(JSON.parse(d.toString()) as FeedMessage));
    const { promise: opened, resolve: openResolve } = Promise.withResolvers<void>();
    ws.on("open", () => openResolve());
    await opened;
    const client = await mcpClient();
    await client.callTool({ name: "post_note", arguments: { markdown: "ping" } });
    const msg = await got;
    expect(msg.kind).toBe("created");
    expect((msg.event.payload as NotePayload).markdown).toBe("ping");
    ws.close();
    await client.close();
  });

  it("clear_feed clears history and pushes a 'cleared' message over the WebSocket", async () => {
    const client = await mcpClient();
    await client.callTool({ name: "post_note", arguments: { markdown: "soon gone" } });

    const ws = new WebSocket(`ws://127.0.0.1:${hub.port}/ws`);
    const { promise: opened, resolve: openResolve } = Promise.withResolvers<void>();
    ws.on("open", () => openResolve());
    const { promise: got, resolve: gotResolve } = Promise.withResolvers<FeedMessage>();
    ws.on("message", (d) => gotResolve(JSON.parse(d.toString()) as FeedMessage));
    await opened;

    await client.callTool({ name: "clear_feed", arguments: {} });
    expect((await got).kind).toBe("cleared");

    const res = await fetch(`${base}/api/events`);
    expect(((await res.json()) as { events: FeedEvent[] }).events).toEqual([]);
    ws.close();
    await client.close();
  });
});
