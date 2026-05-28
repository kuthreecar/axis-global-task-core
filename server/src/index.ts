import http from "http";
import { MarketState } from "./state.js";
import { HyperliquidClient } from "./hyperliquid.js";
import { attachWsServer } from "./wsServer.js";

const PORT = Number(process.env.PORT ?? 8080);
const FLUSH_MS = Number(process.env.FLUSH_MS ?? 80); // 50-100ms batching window

const state = new MarketState();
const hl = new HyperliquidClient(state);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, seq: state.currentSeq(), symbols: state.symbols().length }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = attachWsServer(server, state, hl);

// Drive batched fanout on a fixed cadence.
setInterval(() => state.flush(), FLUSH_MS);

// Periodic stats
setInterval(() => {
  console.log(`[stats] seq=${state.currentSeq()} symbols=${state.symbols().length} clients=${wss.clientCount()}`);
}, 10000);

hl.start();
server.listen(PORT, () => console.log(`[axis] listening on :${PORT} (ws /ws, flush ${FLUSH_MS}ms)`));
