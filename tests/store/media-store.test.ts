import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveMediaFromBuffer, saveMediaFromPath, mediaPath } from "../../src/store/media-store.js";

// 1x1 transparent PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "acb-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("media store", () => {
  it("saves a base64 buffer and reports png dimensions", () => {
    const m = saveMediaFromBuffer(dir, Buffer.from(PNG_BASE64, "base64"), "image/png");
    expect(m.mediaId.endsWith(".png")).toBe(true);
    expect(existsSync(mediaPath(dir, m.mediaId))).toBe(true);
    expect(m.width).toBe(1);
    expect(m.height).toBe(1);
  });

  it("saves from a file path, inferring mime from extension", () => {
    const src = join(dir, "shot.png");
    writeFileSync(src, Buffer.from(PNG_BASE64, "base64"));
    const m = saveMediaFromPath(dir, src);
    expect(m.mime).toBe("image/png");
    expect(existsSync(mediaPath(dir, m.mediaId))).toBe(true);
  });

  it("throws a clear error when the path does not exist", () => {
    expect(() => saveMediaFromPath(dir, join(dir, "missing.png"))).toThrow(/not found/i);
  });
});
