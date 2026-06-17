import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { FeedEvent } from "./types";
import { fetchEvents } from "./api";
import { connectFeed, type FeedConnection } from "./ws-client";
import { FeedStore } from "./store";
import { Feed } from "./feed";
import { maybeNotify, requestNotifyPermission } from "./notify";
import "./styles.css";

function App() {
  const [store] = useState(() => new FeedStore());
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);

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
        onMessage: (m) => { store.apply(m); maybeNotify(m.event); refresh(); },
      });
    });

    return () => { active = false; conn?.close(); };
  }, []);

  return <Feed events={events} connected={connected} />;
}

render(<App />, document.getElementById("app")!);
