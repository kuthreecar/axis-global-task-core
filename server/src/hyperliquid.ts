import { WebSocket } from "ws";
import type { MarketState } from "./state.js";

// Hyperliquid endpoints
const WS_URL = "wss://api.hyperliquid.xyz/ws";
const INFO_URL = "https://api.hyperliquid.xyz/info";

// Subscribes to allMids on the perps WS and polls metaAndAssetCtxs every few
// seconds for 24h change %, volume, funding, OI.
//
// Hyperliquid's allMids returns mids for BOTH perps (e.g. "BTC") and spot
// (e.g. "@1"). We keep perps because they have a name; for spot, we resolve
// @<idx> to the human ticker via spotMeta on startup.

export type BookLevel = [number, number]; // [px, size]
export type BookSnapshot = { bids: BookLevel[]; asks: BookLevel[]; ts: number };

export class HyperliquidClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private spotNameByIndex = new Map<number, string>();
  private bookSubs = new Map<string, Set<(b: BookSnapshot) => void>>();
  private bookSnapshots = new Map<string, BookSnapshot>();

  constructor(private state: MarketState) {}

  async start() {
    await this.loadSpotMeta().catch((e) => console.warn("spotMeta failed:", e));
    this.connect();
    this.startCtxPolling();
  }

  private async loadSpotMeta() {
    const res = await fetch(INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "spotMeta" }),
    });
    const data: any = await res.json();
    // data.tokens: [{ name, index, ... }]
    // data.universe: [{ name: "PURR/USDC", tokens: [tokenIdx, usdcIdx], index }]
    const tokenName = new Map<number, string>();
    for (const t of data.tokens ?? []) tokenName.set(t.index, t.name);
    for (const u of data.universe ?? []) {
      // u.name like "@1" or "PURR/USDC"; u.tokens[0] is the base token idx
      const base = tokenName.get(u.tokens?.[0]);
      const display = base ? `${base}-SPOT` : u.name;
      this.spotNameByIndex.set(u.index, display);
    }
  }

  private resolveSymbol(raw: string): string {
    if (raw.startsWith("@")) {
      const idx = Number(raw.slice(1));
      return this.spotNameByIndex.get(idx) ?? raw;
    }
    return raw;
  }

  private connect() {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.on("open", () => {
      console.log("[hl] connected");
      this.reconnectDelay = 1000;
      ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } }));
      // Re-subscribe to any active books
      for (const s of this.bookSubs.keys()) this.sendBookSub(s);
    });
    ws.on("message", (raw) => this.onMessage(raw.toString()));
    ws.on("close", () => {
      console.warn("[hl] disconnected, reconnecting in", this.reconnectDelay, "ms");
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
    });
    ws.on("error", (e) => console.warn("[hl] ws error:", (e as Error).message));
  }

  private onMessage(text: string) {
    let msg: any;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.channel === "allMids" && msg.data?.mids) {
      const mids: Record<string, string> = msg.data.mids;
      for (const [raw, pxStr] of Object.entries(mids)) {
        const px = parseFloat(pxStr);
        if (!Number.isFinite(px)) continue;
        const sym = this.resolveSymbol(raw);
        this.state.ingest({ s: sym, p: px });
      }
    } else if (msg.channel === "l2Book" && msg.data) {
      const d = msg.data;
      const sym = this.resolveSymbol(d.coin);
      const levels = d.levels as [Array<{ px: string; sz: string }>, Array<{ px: string; sz: string }>];
      const bids = levels[0].slice(0, 15).map((l) => [parseFloat(l.px), parseFloat(l.sz)] as BookLevel);
      const asks = levels[1].slice(0, 15).map((l) => [parseFloat(l.px), parseFloat(l.sz)] as BookLevel);
      const snap: BookSnapshot = { bids, asks, ts: Date.now() };
      this.bookSnapshots.set(sym, snap);
      const subs = this.bookSubs.get(sym);
      if (subs) for (const fn of subs) fn(snap);
    }
  }

  private startCtxPolling() {
    const poll = async () => {
      try {
        const res = await fetch(INFO_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "metaAndAssetCtxs" }),
        });
        const data: any = await res.json();
        // data is [meta, ctxs]; meta.universe[i] aligns with ctxs[i]
        const meta = data?.[0];
        const ctxs = data?.[1];
        if (!meta || !ctxs) return;
        for (let i = 0; i < meta.universe.length; i++) {
          const sym = meta.universe[i].name;
          const c = ctxs[i];
          if (!c) continue;
          const prev = parseFloat(c.prevDayPx);
          const vol = parseFloat(c.dayNtlVlm);
          const f = parseFloat(c.funding);
          const oi = parseFloat(c.openInterest);
          this.state.ingest({ s: sym, o: prev, v: vol, f, oi });
        }
      } catch (e) {
        console.warn("[hl] ctx poll failed:", (e as Error).message);
      }
    };
    poll();
    setInterval(poll, 5000);
  }

  // ---- L2 book subscriptions (per-asset, on demand) ----

  private sendBookSub(symbol: string) {
    // symbol here is the display symbol; Hyperliquid expects raw coin
    // (for perps, the same; for spot, "@<idx>"). We only allow perps from UI.
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      method: "subscribe",
      subscription: { type: "l2Book", coin: symbol },
    }));
  }

  subscribeBook(symbol: string, fn: (b: BookSnapshot) => void): () => void {
    let set = this.bookSubs.get(symbol);
    if (!set) {
      set = new Set();
      this.bookSubs.set(symbol, set);
      this.sendBookSub(symbol);
    }
    set.add(fn);
    const cached = this.bookSnapshots.get(symbol);
    if (cached) fn(cached);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) {
        this.bookSubs.delete(symbol);
        this.bookSnapshots.delete(symbol);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            method: "unsubscribe",
            subscription: { type: "l2Book", coin: symbol },
          }));
        }
      }
    };
  }
}
