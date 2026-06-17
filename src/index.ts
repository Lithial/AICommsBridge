#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { startHub } from "./hub.js";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist");

startHub(loadConfig(), webDir).then((hub) => {
  console.log(`AICommsBridge hub: http://127.0.0.1:${hub.port}  (UI: /, MCP: /mcp)`);
  const shutdown = () => hub.close().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
