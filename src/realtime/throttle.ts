import type { FeedMessage } from "../domain/events.js";

/**
 * Wraps a send function: 'created' messages pass through immediately;
 * 'updated' messages are coalesced per event id and flushed at most once
 * per `intervalMs`, always sending the latest state for each id.
 */
export function createThrottler(send: (m: FeedMessage) => void, intervalMs = 100): (m: FeedMessage) => void {
  const pending = new Map<number, FeedMessage>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    for (const m of pending.values()) send(m);
    pending.clear();
    timer = null;
  };

  return (msg: FeedMessage): void => {
    if (msg.kind === "created") { send(msg); return; }
    pending.set(msg.event.id, msg);
    if (!timer) timer = setTimeout(flush, intervalMs);
  };
}
