import { describe, it, expect } from "vitest";
import { FeedStore } from "./store";
import type { FeedEvent, ProgressPayload } from "./types";

const ev = (id: number, percent: number): FeedEvent => ({
  id, channelId: "default", type: "progress", key: "b", createdAt: id, updatedAt: id,
  payload: { label: "Build", percent, status: "active" },
});

describe("FeedStore", () => {
  it("lists events sorted by id ascending", () => {
    const s = new FeedStore();
    s.upsertMany([ev(3, 1), ev(1, 1), ev(2, 1)]);
    expect(s.list().map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("apply('updated') patches the same id in place", () => {
    const s = new FeedStore();
    s.apply({ kind: "created", event: ev(1, 10) });
    s.apply({ kind: "updated", event: ev(1, 90) });
    expect(s.list().length).toBe(1);
    expect((s.list()[0].payload as ProgressPayload).percent).toBe(90);
  });

  it("lastSeenId returns the max id (0 when empty)", () => {
    const s = new FeedStore();
    expect(s.lastSeenId()).toBe(0);
    s.upsertMany([ev(4, 1), ev(9, 1)]);
    expect(s.lastSeenId()).toBe(9);
  });
});
