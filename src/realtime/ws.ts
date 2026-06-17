import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { Broadcaster } from "./broadcaster.js";
import type { FeedMessage } from "../domain/events.js";
import { createThrottler } from "./throttle.js";

export function attachWebsocket(httpServer: Server, broadcaster: Broadcaster, path = "/ws"): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path });
  wss.on("connection", (socket: WebSocket) => {
    const send = (m: FeedMessage): void => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
    };
    const throttled = createThrottler(send);
    const unsub = broadcaster.subscribe(throttled);
    socket.on("close", unsub);
    socket.on("error", unsub);
  });
  return wss;
}
