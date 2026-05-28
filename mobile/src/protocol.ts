// Mirror of server/src/protocol.ts — kept in sync by hand.
export type AssetSnapshot = {
  s: string; p: number; o?: number; v?: number; f?: number; oi?: number;
};
export type AssetDiff = {
  s: string; p?: number; o?: number; v?: number; f?: number; oi?: number;
};
export type ServerMsg =
  | { t: "snapshot"; seq: number; ts: number; assets: AssetSnapshot[] }
  | { t: "diff"; seq: number; ts: number; changes: AssetDiff[] }
  | { t: "replay"; from: number; to: number; batches: { seq: number; changes: AssetDiff[] }[] }
  | { t: "resync"; reason: string }
  | { t: "book"; s: string; ts: number; bids: [number, number][]; asks: [number, number][] }
  | { t: "pong"; ts: number };
export type ClientMsg =
  | { t: "hello"; lastSeq?: number }
  | { t: "sub_book"; s: string }
  | { t: "unsub_book"; s: string }
  | { t: "ping"; ts: number };
