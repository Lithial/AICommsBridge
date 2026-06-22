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

export function requestNotifyPermission(target: Pick<EventTarget, "addEventListener"> = document): void {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  // Browsers only allow Notification.requestPermission() from inside a user gesture; calling it
  // at mount logs an error and can wedge the page (clicks stop working). Defer to the first interaction.
  target.addEventListener("pointerdown", () => { void Notification.requestPermission(); }, { once: true });
}
