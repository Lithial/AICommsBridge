import type { FeedMessage } from "../domain/events.js";

/**
 * Wraps a send function: 'created' and 'cleared' messages pass through immediately
 * ('cleared' also drops buffered updates it would resurrect); 'updated' messages are
 * coalesced per event id and flushed at most once per `intervalMs` with the latest state.
 */
export function createThrottler(send: (m: FeedMessage) => void, intervalMs = 100): (m: FeedMessage) => void {
  type Updated = Extract<FeedMessage, { kind: "updated" }>;
  const pending = new Map<number, Updated>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    for (const m of pending.values()) send(m);
    pending.clear();
    timer = null;
  };

  return (msg: FeedMessage): void => {
    if (msg.kind === "updated") {
      pending.set(msg.event.id, msg);
      if (!timer) timer = setTimeout(flush, intervalMs);
      return;
    }
    if (msg.kind === "cleared") {
      // Drop buffered updates a clear would otherwise resurrect after it flushes.
      if (msg.channelId == null) pending.clear();
      else for (const [id, m] of pending) if (m.event.channelId === msg.channelId) pending.delete(id);
    }
    // 'created' and 'cleared' pass through immediately.
    send(msg);
  };
}
