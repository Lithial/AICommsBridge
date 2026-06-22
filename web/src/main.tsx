import { render } from "preact";
import { useEffect, useRef, useState, useMemo } from "preact/hooks";
import type { FeedEvent } from "./types";
import { fetchEvents, clearEvents, respondToAsk } from "./api";
import { connectFeed, type FeedConnection } from "./ws-client";
import { FeedStore } from "./store";
import { Feed } from "./feed";
import { maybeNotify, requestNotifyPermission } from "./notify";
import "./styles.css";

function App() {
  const [store] = useState(() => new FeedStore());
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [selectedChannel, setSelectedChannelState] = useState<string | null>(null);
  // ref keeps the handler closure in sync without re-creating it on every render
  const selectedChannelRef = useRef<string | null>(null);

  const setSelectedChannel = (c: string | null): void => {
    selectedChannelRef.current = c;
    setSelectedChannelState(c);
  };

  useEffect(() => {
    let active = true;
    let conn: FeedConnection | undefined;
    const refresh = (): void => { if (active) setEvents(store.list()); };

    requestNotifyPermission();
    fetchEvents({ limit: 200 }).then((initial) => {
      if (!active) return;
      store.upsertMany(initial);
      refresh();
      conn = connectFeed({
        url: `ws://${location.host}/ws`,
        getLastSeenId: () => store.lastSeenId(),
        backfill: (after) => fetchEvents({ after }),
        onStatus: (c) => { if (active) setConnected(c); },
        onMessage: (m) => {
          store.apply(m);
          // if the cleared channel is the one being viewed, fall back to "All"
          if (m.kind === "cleared" && m.channelId != null && m.channelId === selectedChannelRef.current) {
            setSelectedChannel(null);
          }
          if (m.kind !== "cleared") maybeNotify(m.event);
          refresh();
        },
      });
    });

    return () => { active = false; conn?.close(); };
  }, []);

  // derive sorted channel list from what's in the store — no extra fetch needed
  const channels = useMemo(
    () => [...new Set(events.map((e) => e.channelId))].sort(),
    [events],
  );

  // if the selected channel no longer has events (e.g. after a clear), reset
  const activeChannel = selectedChannel && channels.includes(selectedChannel) ? selectedChannel : null;
  if (activeChannel !== selectedChannel) selectedChannelRef.current = activeChannel;

  const visibleEvents = activeChannel ? events.filter((e) => e.channelId === activeChannel) : events;

  const onClear = (): void => {
    const label = activeChannel ? `channel "${activeChannel}"` : "all channels";
    if (!confirm(`Clear ${label}? This permanently deletes those cards and cannot be undone.`)) return;
    void clearEvents(activeChannel ?? undefined).catch(() => { /* self-heals on reconnect */ });
  };

  return (
    <Feed
      events={visibleEvents}
      connected={connected}
      channels={channels}
      selectedChannel={activeChannel}
      onSelectChannel={setSelectedChannel}
      onClear={onClear}
      onRespond={respondToAsk}
    />
  );
}

render(<App />, document.getElementById("app")!);
