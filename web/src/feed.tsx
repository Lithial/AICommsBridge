import { useRef, useEffect } from "preact/hooks";
import type { FeedEvent } from "./types";
import { EventCard } from "./cards/EventCard";

interface FeedProps {
  events: FeedEvent[];
  connected: boolean;
  channels: string[];
  selectedChannel: string | null;
  onSelectChannel: (ch: string | null) => void;
  onClear?: () => void;
  onRespond: (requestId: string, answer: string) => Promise<void>;
}

export function Feed({ events, connected, channels, selectedChannel, onSelectChannel, onClear, onRespond }: FeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const onScroll = (): void => {
    const el = containerRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView();
  }, [events.length]);

  return (
    <div class="app">
      <header class="topbar">
        <span class="brand">AICommsBridge</span>
        <div class="topbar-right">
          <span class={`conn ${connected ? "on" : "off"}`}>{connected ? "live" : "reconnecting…"}</span>
          <button class="clear-btn" onClick={() => onClear?.()} disabled={events.length === 0} title={selectedChannel ? `Clear channel "${selectedChannel}"` : "Clear all channels"}>Clear</button>
        </div>
      </header>
      {channels.length > 1 && (
        <nav class="channel-bar">
          <button
            class={`ch-tab${selectedChannel === null ? " active" : ""}`}
            onClick={() => onSelectChannel(null)}
          >
            All
          </button>
          {channels.map((ch) => (
            <button
              key={ch}
              class={`ch-tab${selectedChannel === ch ? " active" : ""}`}
              onClick={() => onSelectChannel(ch)}
            >
              {ch}
            </button>
          ))}
        </nav>
      )}
      <div class="feed" ref={containerRef} onScroll={onScroll}>
        {events.map((e) => <EventCard key={e.id} event={e} onRespond={onRespond} />)}
        <div ref={endRef} />
      </div>
    </div>
  );
}
