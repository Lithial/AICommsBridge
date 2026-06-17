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
  app.use(express.json({ limit: "32mb" }));

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
