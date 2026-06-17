import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  port: number;
  dataDir: string;
  dbPath: string;
  mediaDir: string;
}

export function loadConfig(): Config {
  const dataDir = process.env.AICB_DATA_DIR ?? join(homedir(), ".aicommsbridge");
  return {
    port: Number(process.env.AICB_PORT ?? 4319),
    dataDir,
    dbPath: join(dataDir, "db.sqlite"),
    mediaDir: join(dataDir, "media"),
  };
}
