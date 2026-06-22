import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "./store/db.js";
import { Broadcaster } from "./realtime/broadcaster.js";
import { attachWebsocket } from "./realtime/ws.js";
import { FeedService } from "./feed.js";
import { createApp } from "./http/app.js";
import type { Config } from "./config.js";

export interface Hub {
  port: number;
  close: () => Promise<void>;
}

export function startHub(config: Config, webDir?: string): Promise<Hub> {
  const db = openDb(config.dbPath);
  const bus = new Broadcaster();
  const feed = new FeedService(db, bus, config.mediaDir);
  const app = createApp({ db, feed, mediaDir: config.mediaDir, webDir });
  const httpServer: Server = createServer(app);
  const wss = attachWebsocket(httpServer, bus);

  const { promise, resolve } = Promise.withResolvers<Hub>();
  httpServer.listen(config.port, config.host, () => {
    const port = (httpServer.address() as AddressInfo).port;
    resolve({
      port,
      close: () => {
        const { promise: closed, resolve: done } = Promise.withResolvers<void>();
        wss.close();
        httpServer.close(() => { db.close(); done(); });
        return closed;
      },
    });
  });
  return promise;
}
