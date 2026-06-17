import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEvents } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("fetchEvents", () => {
  it("builds the query string and returns the events array", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ events: [{ id: 1 }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const events = await fetchEvents({ after: 5, limit: 100 });
    expect(events).toEqual([{ id: 1 }]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("after=5");
    expect(url).toContain("limit=100");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(fetchEvents()).rejects.toThrow(/500/);
  });
});
