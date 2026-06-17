import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

const KEYS = ["AICB_PORT", "AICB_DATA_DIR"] as const;
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("loadConfig", () => {
  it("defaults port to 4319 and data dir under home", () => {
    const c = loadConfig();
    expect(c.port).toBe(4319);
    expect(c.dbPath.endsWith("db.sqlite")).toBe(true);
    expect(c.mediaDir.endsWith("media")).toBe(true);
  });

  it("honors env overrides", () => {
    process.env.AICB_PORT = "5005";
    process.env.AICB_DATA_DIR = "/tmp/acb-test";
    const c = loadConfig();
    expect(c.port).toBe(5005);
    expect(c.dataDir).toBe("/tmp/acb-test");
    expect(c.dbPath).toBe("/tmp/acb-test/db.sqlite");
  });
});
