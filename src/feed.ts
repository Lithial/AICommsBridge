import type { Db } from "./store/db.js";
import type { Broadcaster } from "./realtime/broadcaster.js";
import { insertEvent, upsertProgress, appendLog, clearEvents } from "./store/events.js";
import { saveMediaFromBuffer, saveMediaFromPath, deleteMedia } from "./store/media-store.js";
import { computeUnifiedDiff } from "./domain/diff.js";
import type { FeedEvent, NotePayload, ProgressPayload } from "./domain/events.js";

export class FeedService {
  constructor(
    private readonly db: Db,
    private readonly bus: Broadcaster,
    private readonly mediaDir: string,
  ) {}

  private created(event: FeedEvent): FeedEvent {
    this.bus.broadcast({ kind: "created", event });
    return event;
  }

  private emit(created: boolean, event: FeedEvent): FeedEvent {
    this.bus.broadcast(created ? { kind: "created", event } : { kind: "updated", event });
    return event;
  }

  showImage(p: { channelId: string; path?: string; data?: string; mimeType?: string; caption?: string }): FeedEvent {
    if (!p.path && !p.data) throw new Error("show_image requires either 'path' or 'data'.");
    const media = p.data
      ? saveMediaFromBuffer(this.mediaDir, Buffer.from(p.data, "base64"), p.mimeType ?? "image/png")
      : saveMediaFromPath(this.mediaDir, p.path!, p.mimeType);
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "image",
        payload: { mediaId: media.mediaId, mime: media.mime, caption: p.caption, width: media.width, height: media.height },
      }),
    );
  }

  postNote(p: { channelId: string; markdown: string; level?: NotePayload["level"]; title?: string }): FeedEvent {
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "note",
        payload: { markdown: p.markdown, level: p.level ?? "info", title: p.title },
      }),
    );
  }

  updateProgress(p: { channelId: string; key: string; label: string; percent?: number; status?: ProgressPayload["status"] }): FeedEvent {
    const { event, created } = upsertProgress(this.db, {
      channelId: p.channelId,
      key: p.key,
      payload: { label: p.label, percent: p.percent, status: p.status ?? "active" },
    });
    return this.emit(created, event);
  }

  showCode(p: { channelId: string; code: string; language?: string; filename?: string; caption?: string }): FeedEvent {
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "code",
        payload: { mode: "code", code: p.code, language: p.language, filename: p.filename, caption: p.caption },
      }),
    );
  }

  showDiff(p: { channelId: string; diff?: string; before?: string; after?: string; filename?: string; language?: string }): FeedEvent {
    const diff = p.diff ?? computeUnifiedDiff(p.before ?? "", p.after ?? "", p.filename ?? "file");
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "code",
        payload: { mode: "diff", diff, language: p.language, filename: p.filename },
      }),
    );
  }

  addLink(p: { channelId: string; url: string; title?: string; description?: string }): FeedEvent {
    return this.created(
      insertEvent(this.db, {
        channelId: p.channelId,
        type: "link",
        payload: { url: p.url, title: p.title, description: p.description },
      }),
    );
  }

  appendLog(p: { channelId: string; key: string; text: string; title?: string }): FeedEvent {
    const { event, created } = appendLog(this.db, p);
    return this.emit(created, event);
  }

  /** Deletes events (all channels, or one when `channelId` is set), prunes their media, and broadcasts a clear. */
  clear(p: { channelId?: string } = {}): { deleted: number } {
    const { deleted, mediaIds } = clearEvents(this.db, p.channelId);
    for (const mediaId of mediaIds) deleteMedia(this.mediaDir, mediaId);
    this.bus.broadcast({ kind: "cleared", channelId: p.channelId });
    return { deleted };
  }
}
