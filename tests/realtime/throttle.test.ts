import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThrottler } from "../../src/realtime/throttle.js";
import type { FeedMessage } from "../../src/domain/events.js";

const make = (id: number, kind: "created" | "updated"): FeedMessage => ({ kind, event: { id, channelId: "default", type: "progress", key: "k", createdAt: 0, updatedAt: id, payload: { label: "x", status: "active" } } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createThrottler", () => {
  it("passes 'created' through immediately", () => {
    const send = vi.fn<(m: FeedMessage) => void>();
    const t = createThrottler(send, 100);
    t(make(1, "created"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid 'updated' for the same id, flushing the latest", () => {
    const send = vi.fn<(m: FeedMessage) => void>();
    const t = createThrottler(send, 100);
    t(make(7, "updated"));
    t(make(7, "updated"));
    t(make(7, "updated"));
    expect(send).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].event.id).toBe(7);
  });

  it("passes 'cleared' through immediately and drops buffered updates it would resurrect", () => {
    const send = vi.fn<(m: FeedMessage) => void>();
    const t = createThrottler(send, 100);
    t(make(7, "updated"));            // buffered, not yet sent
    t({ kind: "cleared" });           // clears everything immediately
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].kind).toBe("cleared");
    vi.advanceTimersByTime(100);      // the buffered update must NOT flush
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a channel-scoped 'cleared' only drops buffered updates for that channel", () => {
    const send = vi.fn<(m: FeedMessage) => void>();
    const t = createThrottler(send, 100);
    t(make(7, "updated"));                       // channel "default"
    t({ kind: "cleared", channelId: "other" });  // unrelated channel
    vi.advanceTimersByTime(100);
    const kinds = send.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(["cleared", "updated"]);
  });
});
