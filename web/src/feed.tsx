import { useRef, useEffect } from "preact/hooks";
import type { FeedEvent } from "./types";
import { EventCard } from "./cards/EventCard";

export function Feed({ events, connected }: { events: FeedEvent[]; connected: boolean }) {
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
        <span class={`conn ${connected ? "on" : "off"}`}>{connected ? "live" : "reconnecting…"}</span>
      </header>
      <div class="feed" ref={containerRef} onScroll={onScroll}>
        {events.map((e) => <EventCard key={e.id} event={e} />)}
        <div ref={endRef} />
      </div>
    </div>
  );
}
