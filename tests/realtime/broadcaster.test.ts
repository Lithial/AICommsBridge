import { describe, it, expect, vi } from "vitest";
import { Broadcaster } from "../../src/realtime/broadcaster.js";
import type { FeedMessage } from "../../src/domain/events.js";

const msg = (id: number): FeedMessage => ({ kind: "created", event: { id, channelId: "default", type: "note", key: null, createdAt: 0, updatedAt: 0, payload: { markdown: "x", level: "info" } } });

describe("Broadcaster", () => {
  it("delivers to all subscribers and supports unsubscribe", () => {
    const b = new Broadcaster();
    const a = vi.fn(); const c = vi.fn();
    const offA = b.subscribe(a); b.subscribe(c);
    b.broadcast(msg(1));
    offA();
    b.broadcast(msg(2));
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(2);
  });

  it("isolates a throwing subscriber from the rest", () => {
    const b = new Broadcaster();
    b.subscribe(() => { throw new Error("boom"); });
    const ok = vi.fn();
    b.subscribe(ok);
    expect(() => b.broadcast(msg(1))).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
