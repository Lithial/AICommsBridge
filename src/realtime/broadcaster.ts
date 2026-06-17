import type { FeedMessage } from "../domain/events.js";

export type Subscriber = (msg: FeedMessage) => void;

export class Broadcaster {
  private subs = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }

  broadcast(msg: FeedMessage): void {
    for (const fn of [...this.subs]) {
      try { fn(msg); } catch { /* isolate one bad subscriber */ }
    }
  }

  get size(): number {
    return this.subs.size;
  }
}
