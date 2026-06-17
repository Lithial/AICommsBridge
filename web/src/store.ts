import type { FeedEvent, FeedMessage } from "./types";

export class FeedStore {
  private readonly map = new Map<number, FeedEvent>();

  apply(msg: FeedMessage): void {
    this.map.set(msg.event.id, msg.event);
  }

  upsertMany(events: FeedEvent[]): void {
    for (const e of events) this.map.set(e.id, e);
  }

  list(): FeedEvent[] {
    return [...this.map.values()].sort((a, b) => a.id - b.id);
  }

  lastSeenId(): number {
    let max = 0;
    for (const id of this.map.keys()) if (id > max) max = id;
    return max;
  }
}
