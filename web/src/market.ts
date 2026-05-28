// External market store. Lives OUTSIDE React so we can update 5+ Hz across
// hundreds of symbols without React reconciling the whole tree.
// React components subscribe per-symbol via useSyncExternalStore and re-render
// only the affected <PriceCell>.

import type { AssetDiff, AssetSnapshot, ClientMsg, ServerMsg } from "./protocol";

export type Row = {
  s: string;
  p: number;       // current price
  prevP: number;   // previous price (for flash direction)
  o?: number;      // prev-day open
  v?: number;      // 24h volume
  f?: number;      // funding
  oi?: number;     // open interest
  lastTickTs: number;
};

type SymbolListener = () => void;
type GlobalListener = () => void;

class MarketStore {
  rows = new Map<string, Row>();
  // Per-symbol listeners (one Set per symbol).
  private symListeners = new Map<string, Set<SymbolListener>>();
  // Listeners for the symbol *set* changing (new symbols added, etc.)
  private globalListeners = new Set<GlobalListener>();
  private lastSeq = 0;
  private bookListeners = new Map<string, Set<(b: { bids: [number, number][]; asks: [number, number][]; ts: number }) => void>>();
  private booksCache = new Map<string, { bids: [number, number][]; asks: [number, number][]; ts: number }>();

  getRow(s: string): Row | undefined { return this.rows.get(s); }
  getSeq(): number { return this.lastSeq; }
  allSymbols(): string[] { return Array.from(this.rows.keys()); }

  subscribeSymbol(s: string, fn: SymbolListener): () => void {
    let set = this.symListeners.get(s);
    if (!set) { set = new Set(); this.symListeners.set(s, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }
  subscribeGlobal(fn: GlobalListener): () => void {
    this.globalListeners.add(fn);
    return () => this.globalListeners.delete(fn);
  }
  subscribeBook(s: string, fn: (b: { bids: [number, number][]; asks: [number, number][]; ts: number }) => void): () => void {
    let set = this.bookListeners.get(s);
    if (!set) { set = new Set(); this.bookListeners.set(s, set); }
    set.add(fn);
    const cached = this.booksCache.get(s);
    if (cached) fn(cached);
    return () => { set!.delete(fn); };
  }

  applySnapshot(seq: number, assets: AssetSnapshot[]) {
    const known = new Set(this.rows.keys());
    let symbolSetChanged = false;
    for (const a of assets) {
      const cur = this.rows.get(a.s);
      const next: Row = {
        s: a.s,
        p: a.p,
        prevP: cur?.p ?? a.p,
        o: a.o, v: a.v, f: a.f, oi: a.oi,
        lastTickTs: Date.now(),
      };
      if (!cur) symbolSetChanged = true;
      this.rows.set(a.s, next);
      known.delete(a.s);
      this.notifySym(a.s);
    }
    // Anything in `known` left over is no longer present — drop.
    for (const s of known) { this.rows.delete(s); symbolSetChanged = true; this.notifySym(s); }
    this.lastSeq = seq;
    if (symbolSetChanged) this.notifyGlobal();
  }

  applyDiffs(seq: number, changes: AssetDiff[]) {
    let symbolSetChanged = false;
    for (const d of changes) {
      const cur = this.rows.get(d.s);
      if (!cur) {
        this.rows.set(d.s, {
          s: d.s,
          p: d.p ?? 0,
          prevP: d.p ?? 0,
          o: d.o, v: d.v, f: d.f, oi: d.oi,
          lastTickTs: Date.now(),
        });
        symbolSetChanged = true;
      } else {
        if (d.p !== undefined && d.p !== cur.p) { cur.prevP = cur.p; cur.p = d.p; cur.lastTickTs = Date.now(); }
        if (d.o !== undefined) cur.o = d.o;
        if (d.v !== undefined) cur.v = d.v;
        if (d.f !== undefined) cur.f = d.f;
        if (d.oi !== undefined) cur.oi = d.oi;
      }
      this.notifySym(d.s);
    }
    this.lastSeq = seq;
    if (symbolSetChanged) this.notifyGlobal();
  }

  applyBook(s: string, b: { bids: [number, number][]; asks: [number, number][]; ts: number }) {
    this.booksCache.set(s, b);
    const set = this.bookListeners.get(s);
    if (set) for (const fn of set) fn(b);
  }

  private notifySym(s: string) {
    const set = this.symListeners.get(s);
    if (set) for (const fn of set) fn();
  }
  private notifyGlobal() {
    for (const fn of this.globalListeners) fn();
  }
}

export const market = new MarketStore();

// ---- Connection ----

export type ConnState = "connecting" | "connected" | "reconnecting" | "stale" | "offline";

type ConnSnapshot = { state: ConnState; rtt: number; lastMsgAt: number };

class Conn {
  state: ConnState = "connecting";
  lastMsgAt = 0;
  lastRtt = 0;
  // Cached snapshot returned by getSnapshot(). MUST be a stable reference
  // between actual state changes, or useSyncExternalStore loops infinitely.
  private snap: ConnSnapshot = { state: "connecting", rtt: 0, lastMsgAt: 0 };
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Set<() => void>();
  private retryDelay = 500;
  private retryTimer: number | null = null;
  private staleTimer: number | null = null;
  private pingTimer: number | null = null;
  private pendingBookSubs = new Set<string>();
  // Symbols the UI currently wants book data for
  private bookRefcount = new Map<string, number>();
  // Stale threshold: ticks should arrive frequently; if no msg for >5s, mark stale.
  private STALE_MS = 5000;

  constructor(url: string) {
    this.url = url;
  }

  getSnap(): ConnSnapshot { return this.snap; }

  start() {
    this.connect();
    this.staleTimer = window.setInterval(() => {
      if (this.state === "connected" && Date.now() - this.lastMsgAt > this.STALE_MS) {
        this.setState("stale");
      } else if (this.state === "stale") {
        // Keep the "Stale · Xs" counter ticking while we wait.
        this.refreshSnap();
      }
    }, 1000);
    // Background/resume: when tab becomes visible, force a re-hello so we
    // either backfill via lastSeq or get a fresh snapshot.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        // If socket is open, send a hello to reconcile.
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.send({ t: "hello", lastSeq: market.getSeq() });
        } else {
          // Force reconnect immediately
          this.scheduleReconnect(0);
        }
      }
    });
    window.addEventListener("online", () => this.scheduleReconnect(0));
    window.addEventListener("offline", () => this.setState("offline"));
  }

  private connect() {
    this.setState(market.getSeq() > 0 ? "reconnecting" : "connecting");
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.retryDelay = 500;
        this.lastMsgAt = Date.now();
        this.setState("connected");
        // Hello with lastSeq triggers backfill or fresh snapshot.
        this.send({ t: "hello", lastSeq: market.getSeq() });
        // Re-subscribe to any books the UI cares about
        for (const s of this.bookRefcount.keys()) this.send({ t: "sub_book", s });
        // Heartbeat
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) this.send({ t: "ping", ts: Date.now() });
        }, 10000);
      };
      ws.onmessage = (ev) => {
        this.lastMsgAt = Date.now();
        if (this.state !== "connected") this.setState("connected");
        let msg: ServerMsg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.handle(msg);
      };
      ws.onclose = () => {
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
        this.scheduleReconnect();
      };
      ws.onerror = () => { /* let onclose handle */ };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(delay?: number) {
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    this.setState("reconnecting");
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    const d = delay ?? this.retryDelay;
    this.retryTimer = window.setTimeout(() => this.connect(), d);
    this.retryDelay = Math.min(this.retryDelay * 2, 10000);
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case "snapshot": market.applySnapshot(msg.seq, msg.assets); break;
      case "diff": market.applyDiffs(msg.seq, msg.changes); break;
      case "replay":
        for (const b of msg.batches) market.applyDiffs(b.seq, b.changes);
        break;
      case "resync":
        // Force a fresh hello with lastSeq=0 to request a snapshot.
        this.send({ t: "hello" });
        break;
      case "book":
        market.applyBook(msg.s, { bids: msg.bids, asks: msg.asks, ts: msg.ts });
        break;
      case "pong":
        this.lastRtt = Date.now() - msg.ts;
        this.refreshSnap();
        break;
    }
  }

  send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  refBook(s: string) {
    const n = (this.bookRefcount.get(s) ?? 0) + 1;
    this.bookRefcount.set(s, n);
    if (n === 1) this.send({ t: "sub_book", s });
  }
  unrefBook(s: string) {
    const n = (this.bookRefcount.get(s) ?? 0) - 1;
    if (n <= 0) {
      this.bookRefcount.delete(s);
      this.send({ t: "unsub_book", s });
    } else {
      this.bookRefcount.set(s, n);
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private setState(s: ConnState) {
    if (s === this.state) return;
    this.state = s;
    this.refreshSnap();
  }

  private refreshSnap() {
    this.snap = { state: this.state, rtt: this.lastRtt, lastMsgAt: this.lastMsgAt };
    for (const fn of this.listeners) fn();
  }
}

const WS_URL = (import.meta as any).env?.VITE_WS_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8080/ws`;
export const conn = new Conn(WS_URL);
