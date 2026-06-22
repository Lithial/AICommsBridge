import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

const KEYS = ["AICB_HOST", "AICB_PORT", "AICB_DATA_DIR"] as const;
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("loadConfig", () => {
  it("defaults host to loopback, port to 4500, data dir under home", () => {
    const c = loadConfig();
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(4500);
    expect(c.dbPath.endsWith("db.sqlite")).toBe(true);
    expect(c.mediaDir.endsWith("media")).toBe(true);
  });

  it("honors env overrides", () => {
    process.env.AICB_HOST = "0.0.0.0";
    process.env.AICB_PORT = "5005";
    process.env.AICB_DATA_DIR = "/tmp/acb-test";
    const c = loadConfig();
    expect(c.host).toBe("0.0.0.0");
    expect(c.port).toBe(5005);
    expect(c.dataDir).toBe("/tmp/acb-test");
    expect(c.dbPath).toBe("/tmp/acb-test/db.sqlite");
  });
});
