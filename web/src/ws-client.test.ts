import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectFeed, type WsLike } from "./ws-client";
import type { FeedEvent, FeedMessage } from "./types";

class FakeWs implements WsLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => this.onclose?.());
  emit(msg: FeedMessage) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const note = (id: number): FeedEvent => ({ id, channelId: "default", type: "note", key: null, createdAt: id, updatedAt: id, payload: { markdown: "x", level: "info" } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("connectFeed", () => {
  it("backfills from lastSeenId before delivering live messages", async () => {
    const seen: FeedMessage[] = [];
    const backfill = vi.fn(async () => [note(2), note(3)]);
    let socket!: FakeWs;
    connectFeed({
      url: "ws://x/ws",
      onMessage: (m) => seen.push(m),
      getLastSeenId: () => 1,
      backfill,
      wsFactory: () => (socket = new FakeWs()),
    });
    await vi.runOnlyPendingTimersAsync(); // let the async connect() resolve
    expect(backfill).toHaveBeenCalledWith(1);
    socket.onopen?.();
    socket.emit({ kind: "created", event: note(4) });
    expect(seen.map((m) => m.event.id)).toEqual([2, 3, 4]);
  });

  it("reconnects with backoff after a close", async () => {
    const factory = vi.fn(() => new FakeWs());
    const conn = connectFeed({
      url: "ws://x/ws",
      onMessage: () => {},
      getLastSeenId: () => 0,
      backfill: async () => [],
      wsFactory: factory,
      baseDelayMs: 100,
    });
    await vi.runOnlyPendingTimersAsync();
    expect(factory).toHaveBeenCalledTimes(1);
    (factory.mock.results[0].value as FakeWs).onclose?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(factory).toHaveBeenCalledTimes(2);
    conn.close();
  });
});
