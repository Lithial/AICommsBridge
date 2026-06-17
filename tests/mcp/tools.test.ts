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
import type { NotePayload, ProgressPayload } from "../../src/domain/events.js";

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
    expect((events[0].payload as NotePayload).level).toBe("important");
  });

  it("update_progress upserts by key (one row, latest percent)", async () => {
    await client.callTool({ name: "update_progress", arguments: { key: "b", label: "Build", percent: 20 } });
    await client.callTool({ name: "update_progress", arguments: { key: "b", label: "Build", percent: 75 } });
    const events = queryEvents(db, {});
    expect(events.length).toBe(1);
    expect((events[0].payload as ProgressPayload).percent).toBe(75);
  });

  it("show_image without path or data returns a tool error", async () => {
    const res = await client.callTool({ name: "show_image", arguments: { caption: "x" } });
    expect(res.isError).toBe(true);
  });
});
