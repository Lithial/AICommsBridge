import type { FeedEvent } from "./types";

export async function fetchEvents(params: { after?: number; before?: number; limit?: number } = {}): Promise<FeedEvent[]> {
  const q = new URLSearchParams();
  if (params.after != null) q.set("after", String(params.after));
  if (params.before != null) q.set("before", String(params.before));
  if (params.limit != null) q.set("limit", String(params.limit));
  const res = await fetch(`/api/events?${q.toString()}`);
  if (!res.ok) throw new Error(`fetchEvents failed: ${res.status}`);
  const body = (await res.json()) as { events: FeedEvent[] };
  return body.events;
}

export async function clearEvents(channel?: string): Promise<number> {
  const q = new URLSearchParams();
  if (channel != null) q.set("channel", channel);
  const res = await fetch(`/api/events?${q.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`clearEvents failed: ${res.status}`);
  const body = (await res.json()) as { deleted: number };
  return body.deleted;
}

export interface ChannelSummary {
  id: string;
  title: string | null;
  createdAt: number;
  eventCount: number;
  lastUpdated: number | null;
}

export async function fetchChannels(): Promise<ChannelSummary[]> {
  const res = await fetch("/api/channels");
  if (!res.ok) throw new Error(`fetchChannels failed: ${res.status}`);
  const body = (await res.json()) as { channels: ChannelSummary[] };
  return body.channels;
}

export async function respondToAsk(requestId: string, answer: string): Promise<void> {
  const res = await fetch(`/api/respond/${encodeURIComponent(requestId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) throw new Error(`respondToAsk failed: ${res.status}`);
}
