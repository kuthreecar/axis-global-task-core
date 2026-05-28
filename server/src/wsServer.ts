import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { IncomingMessage, Server } from "http";
import type { MarketState } from "./state.js";
import type { HyperliquidClient, BookSnapshot } from "./hyperliquid.js";
import type { ClientMsg, ServerMsg } from "./protocol.js";

// One serialized message per batch is reused across all clients (key win).
// Clients pay only the cost of socket.send().

type Client = {
  ws: WebSocket;
  alive: boolean;
  bookUnsubs: Map<string, () => void>;
};

export function attachWsServer(httpServer: Server, state: MarketState, hl: HyperliquidClient) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<Client>();

  // Pre-serialize each diff batch once; broadcast to all open sockets.
  state.onBatch((b) => {
    const payload: ServerMsg = { t: "diff", seq: b.seq, ts: b.ts, changes: b.changes };
    const data = JSON.stringify(payload);
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        // bufferedAmount backpressure check: if a client is more than ~1MB
        // behind, drop them; they'll reconnect and snapshot fresh.
        if (c.ws.bufferedAmount > 1_000_000) {
          try { c.ws.close(1013, "backpressure"); } catch {}
          continue;
        }
        c.ws.send(data);
      }
    }
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const client: Client = { ws, alive: true, bookUnsubs: new Map() };
    clients.add(client);

    ws.on("pong", () => { client.alive = true; });

    ws.on("message", (raw: RawData) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      switch (msg.t) {
        case "hello": {
          if (typeof msg.lastSeq === "number" && msg.lastSeq > 0) {
            const replay = state.replaySince(msg.lastSeq);
            if (replay === null) {
              // Too far behind -> fresh snapshot
              const snap = state.snapshot();
              send(ws, { t: "snapshot", seq: snap.seq, ts: snap.ts, assets: snap.assets });
            } else if (replay.length === 0) {
              // Up to date; just confirm with a no-op snapshot to align state
              const snap = state.snapshot();
              send(ws, { t: "snapshot", seq: snap.seq, ts: snap.ts, assets: snap.assets });
            } else {
              send(ws, {
                t: "replay",
                from: msg.lastSeq,
                to: state.currentSeq(),
                batches: replay.map((b) => ({ seq: b.seq, changes: b.changes })),
              });
            }
          } else {
            const snap = state.snapshot();
            send(ws, { t: "snapshot", seq: snap.seq, ts: snap.ts, assets: snap.assets });
          }
          break;
        }
        case "sub_book": {
          if (client.bookUnsubs.has(msg.s)) return;
          const unsub = hl.subscribeBook(msg.s, (b: BookSnapshot) => {
            send(ws, { t: "book", s: msg.s, ts: b.ts, bids: b.bids, asks: b.asks });
          });
          client.bookUnsubs.set(msg.s, unsub);
          break;
        }
        case "unsub_book": {
          const u = client.bookUnsubs.get(msg.s);
          if (u) { u(); client.bookUnsubs.delete(msg.s); }
          break;
        }
        case "ping": {
          send(ws, { t: "pong", ts: msg.ts });
          break;
        }
      }
    });

    ws.on("close", () => {
      for (const u of client.bookUnsubs.values()) u();
      clients.delete(client);
    });
  });

  // Heartbeat to detect dead connections
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { try { c.ws.terminate(); } catch {} clients.delete(c); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch {}
    }
  }, 15000);
  wss.on("close", () => clearInterval(heartbeat));

  return { clientCount: () => clients.size };
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
