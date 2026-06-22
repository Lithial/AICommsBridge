import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  mediaDir: string;
}

export function loadConfig(): Config {
  const dataDir = process.env.AICB_DATA_DIR ?? join(homedir(), ".aicommsbridge");
  return {
    host: process.env.AICB_HOST ?? "127.0.0.1",
    port: Number(process.env.AICB_PORT ?? 4500),
    dataDir,
    dbPath: join(dataDir, "db.sqlite"),
    mediaDir: join(dataDir, "media"),
  };
}
