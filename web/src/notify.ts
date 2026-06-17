import type { FeedEvent, NotePayload } from "./types";

const ALERT_LEVELS = new Set(["important", "warn", "error"]);

export function maybeNotify(event: FeedEvent, doc: { hidden: boolean } = document): void {
  if (event.type !== "note") return;
  const payload = event.payload as NotePayload;
  if (!ALERT_LEVELS.has(payload.level)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!doc.hidden) return;
  new Notification(payload.title ?? "AICommsBridge", { body: payload.markdown.slice(0, 140) });
}

export function requestNotifyPermission(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}
