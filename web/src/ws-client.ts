import type { FeedEvent, FeedMessage } from "./types";

export interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close: () => void;
}

export interface ConnectOpts {
  url: string;
  onMessage: (m: FeedMessage) => void;
  getLastSeenId: () => number;
  backfill: (afterId: number) => Promise<FeedEvent[]>;
  onStatus?: (connected: boolean) => void;
  wsFactory?: (url: string) => WsLike;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface FeedConnection {
  close: () => void;
}

export function connectFeed(opts: ConnectOpts): FeedConnection {
  const factory = opts.wsFactory ?? ((u) => new WebSocket(u) as unknown as WsLike);
  const baseDelay = opts.baseDelayMs ?? 250;
  const maxDelay = opts.maxDelayMs ?? 10000;
  let attempt = 0;
  let closed = false;
  let ws: WsLike | null = null;

  const connect = async (): Promise<void> => {
    if (closed) return;
    // Catch up on anything created while disconnected, before live messages flow.
    try {
      const missed = await opts.backfill(opts.getLastSeenId());
      for (const event of missed) opts.onMessage({ kind: "created", event });
    } catch {
      /* a failed backfill will be retried on the next reconnect cycle */
    }
    if (closed) return;
    ws = factory(opts.url);
    ws.onopen = () => { attempt = 0; opts.onStatus?.(true); };
    ws.onmessage = (ev) => opts.onMessage(JSON.parse(ev.data) as FeedMessage);
    ws.onclose = () => { opts.onStatus?.(false); if (!closed) scheduleReconnect(); };
    ws.onerror = () => ws?.close();
  };

  const scheduleReconnect = (): void => {
    attempt += 1;
    const delay = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
    setTimeout(() => void connect(), delay);
  };

  void connect();
  return { close: () => { closed = true; ws?.close(); } };
}
