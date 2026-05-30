// External market store, RN-flavored.
// Same architecture as the web app: a plain JS Map<symbol, Row>, with per-symbol
// listeners. UI uses useSyncExternalStore (RN 18 supports it) to subscribe per-cell.

import { AppState, type AppStateStatus, Platform } from "react-native";
import Constants from "expo-constants";
import type { AssetDiff, AssetSnapshot, ClientMsg, ServerMsg } from "./protocol";

export type Row = {
  s: string;
  p: number;
  prevP: number;
  o?: number;
  v?: number;
  f?: number;
  oi?: number;
  lastTickTs: number;
};

type SymbolListener = () => void;
type GlobalListener = () => void;
type BookCb = (b: { bids: [number, number][]; asks: [number, number][]; ts: number }) => void;

class MarketStore {
  rows = new Map<string, Row>();
  private symListeners = new Map<string, Set<SymbolListener>>();
  private globalListeners = new Set<GlobalListener>();
  private lastSeq = 0;
  private bookListeners = new Map<string, Set<BookCb>>();
  private booksCache = new Map<string, { bids: [number, number][]; asks: [number, number][]; ts: number }>();

  getRow(s: string): Row | undefined { return this.rows.get(s); }
  getSeq(): number { return this.lastSeq; }

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
  subscribeBook(s: string, fn: BookCb): () => void {
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
        s: a.s, p: a.p, prevP: cur?.p ?? a.p,
        o: a.o, v: a.v, f: a.f, oi: a.oi,
        lastTickTs: Date.now(),
      };
      if (!cur) symbolSetChanged = true;
      this.rows.set(a.s, next);
      known.delete(a.s);
      this.notifySym(a.s);
    }
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
          s: d.s, p: d.p ?? 0, prevP: d.p ?? 0,
          o: d.o, v: d.v, f: d.f, oi: d.oi, lastTickTs: Date.now(),
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

// ---- Connection (RN flavor) ----

export type ConnState = "connecting" | "connected" | "reconnecting" | "stale" | "offline";

function resolveWsUrl(): string {
  // 1) EXPO_PUBLIC_WS_URL env (set via eas.json or .env)
  const env = (process.env as any).EXPO_PUBLIC_WS_URL as string | undefined;
  if (env) return env;
  // 2) extra.wsUrl in app.json
  const extra = (Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra) as { wsUrl?: string } | undefined;
  if (extra?.wsUrl) {
    let url = extra.wsUrl;
    // For Android emulator, localhost on the host is 10.0.2.2 from inside the emulator.
    if (Platform.OS === "android" && url.includes("localhost")) {
      url = url.replace("localhost", "10.0.2.2");
    }
    // For iOS simulator, localhost works fine
    // For physical iOS devices, localhost won't work - user must set actual network IP
    if (Platform.OS === "ios" && !Constants.isDevice && url.includes("localhost")) {
      // iOS simulator - localhost works
      return url;
    }
    // Physical device - use the URL as-is (should be network IP)
    return url;
  }
  // Fallback - this will only work in simulator/emulator
  return "ws://localhost:8080/ws";
}

type ConnSnapshot = { state: ConnState; rtt: number; lastMsgAt: number };

class Conn {
  state: ConnState = "connecting";
  lastMsgAt = 0;
  lastRtt = 0;
  // Cached snapshot returned by getSnap(). MUST be a stable reference
  // between actual state changes, or useSyncExternalStore loops infinitely.
  private snap: ConnSnapshot = { state: "connecting", rtt: 0, lastMsgAt: 0 };
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Set<() => void>();
  private retryDelay = 500;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private bookRefcount = new Map<string, number>();
  private STALE_MS = 5000;
  private appStateSub: { remove(): void } | null = null;

  constructor(url: string) {
    this.url = url;
  }

  getSnap(): ConnSnapshot { return this.snap; }

  start() {
    this.connect();
    this.staleTimer = setInterval(() => {
      if (this.state === "connected" && Date.now() - this.lastMsgAt > this.STALE_MS) {
        this.setState("stale");
      } else if (this.state === "stale") {
        this.refreshSnap();
      }
    }, 1000);
    // RN equivalent of visibilitychange: AppState transitions.
    // When app returns to "active", reconcile via hello{lastSeq}.
    this.appStateSub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.send({ t: "hello", lastSeq: market.getSeq() });
        } else {
          this.scheduleReconnect(0);
        }
      }
    });
  }

  stop() {
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.appStateSub) this.appStateSub.remove();
    if (this.ws) try { this.ws.close(); } catch {}
  }

  private connect() {
    this.setState(market.getSeq() > 0 ? "reconnecting" : "connecting");
    console.log(`[Conn] Connecting to ${this.url}`);
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        console.log(`[Conn] WebSocket opened`);
        this.retryDelay = 500;
        this.lastMsgAt = Date.now();
        this.setState("connected");
        this.send({ t: "hello", lastSeq: market.getSeq() });
        for (const s of this.bookRefcount.keys()) this.send({ t: "sub_book", s });
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) this.send({ t: "ping", ts: Date.now() });
        }, 10000);
      };
      ws.onmessage = (ev: WebSocketMessageEvent) => {
        this.lastMsgAt = Date.now();
        if (this.state !== "connected") this.setState("connected");
        let msg: ServerMsg;
        try { msg = JSON.parse(ev.data as string); } catch { console.error(`[Conn] Failed to parse message: ${ev.data}`); return; }
        this.handle(msg);
      };
      ws.onclose = (event) => {
        console.log(`[Conn] WebSocket closed: code=${event.code} reason=${event.reason}`);
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
        this.scheduleReconnect();
      };
      ws.onerror = (error) => {
        console.error(`[Conn] WebSocket error:`, error);
        /* let onclose handle */
      };
    } catch (error) {
      console.error(`[Conn] Failed to create WebSocket:`, error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(delay?: number) {
    if (this.ws) { try { this.ws.close(); } catch {}; this.ws = null; }
    this.setState("reconnecting");
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const d = delay ?? this.retryDelay;
    this.retryTimer = setTimeout(() => this.connect(), d);
    this.retryDelay = Math.min(this.retryDelay * 2, 10000);
  }

  private handle(msg: ServerMsg) {
    switch (msg.t) {
      case "snapshot": market.applySnapshot(msg.seq, msg.assets); break;
      case "diff": market.applyDiffs(msg.seq, msg.changes); break;
      case "replay":
        for (const b of msg.batches) market.applyDiffs(b.seq, b.changes);
        break;
      case "resync": this.send({ t: "hello" }); break;
      case "book": market.applyBook(msg.s, { bids: msg.bids, asks: msg.asks, ts: msg.ts }); break;
      case "pong": this.lastRtt = Date.now() - msg.ts; this.refreshSnap(); break;
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
    if (n <= 0) { this.bookRefcount.delete(s); this.send({ t: "unsub_book", s }); }
    else this.bookRefcount.set(s, n);
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

export const conn = new Conn(resolveWsUrl());
