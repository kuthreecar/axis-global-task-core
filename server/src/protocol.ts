// Wire protocol shared between server and web client.
// Kept tiny on purpose: short field names, only changed fields per diff.

export type AssetSnapshot = {
  s: string;       // symbol (e.g. "BTC")
  p: number;       // last mid price
  o?: number;      // prev day price (for 24h change)
  v?: number;      // 24h notional volume
  f?: number;      // funding rate (perps)
  oi?: number;     // open interest
};

// A diff entry: symbol + only the fields that changed.
export type AssetDiff = {
  s: string;
  p?: number;
  o?: number;
  v?: number;
  f?: number;
  oi?: number;
};

// Server -> Client
export type ServerMsg =
  | { t: "snapshot"; seq: number; ts: number; assets: AssetSnapshot[] }
  | { t: "diff"; seq: number; ts: number; changes: AssetDiff[] }
  | { t: "replay"; from: number; to: number; batches: { seq: number; changes: AssetDiff[] }[] }
  | { t: "resync"; reason: string } // client must request a fresh snapshot
  | { t: "book"; s: string; ts: number; bids: [number, number][]; asks: [number, number][] }
  | { t: "pong"; ts: number };

// Client -> Server
export type ClientMsg =
  | { t: "hello"; lastSeq?: number }
  | { t: "sub_book"; s: string }
  | { t: "unsub_book"; s: string }
  | { t: "ping"; ts: number };
