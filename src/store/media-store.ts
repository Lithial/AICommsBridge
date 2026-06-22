import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { imageSize } from "image-size";

export interface StoredMedia {
  mediaId: string;
  mime: string;
  width?: number;
  height?: number;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function mediaPath(dir: string, mediaId: string): string {
  return join(dir, mediaId);
}

export function saveMediaFromBuffer(dir: string, buffer: Buffer, mime: string): StoredMedia {
  mkdirSync(dir, { recursive: true });
  const ext = MIME_TO_EXT[mime] ?? "bin";
  const mediaId = `${randomUUID()}.${ext}`;
  writeFileSync(mediaPath(dir, mediaId), buffer);
  let width: number | undefined;
  let height: number | undefined;
  try {
    const d = imageSize(buffer);
    width = d.width;
    height = d.height;
  } catch {
    /* non-image or undetectable; dimensions stay undefined */
  }
  return { mediaId, mime, width, height };
}

export function saveMediaFromPath(dir: string, path: string, mimeOverride?: string): StoredMedia {
  if (!existsSync(path)) throw new Error(`Image path not found: ${path}`);
  const buffer = readFileSync(path);
  const mime = mimeOverride ?? EXT_TO_MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  return saveMediaFromBuffer(dir, buffer, mime);
}

export function deleteMedia(dir: string, mediaId: string): void {
  if (mediaId.includes("/") || mediaId.includes("\\") || mediaId.includes("..")) return;
  try {
    rmSync(mediaPath(dir, mediaId), { force: true });
  } catch {
    /* file already gone or unreadable; nothing to prune */
  }
}
