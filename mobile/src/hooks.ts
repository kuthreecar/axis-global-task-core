import { useSyncExternalStore } from "react";
import { conn, market, type Row, type ConnState } from "./market";

export function useRow(symbol: string): Row | undefined {
  return useSyncExternalStore(
    (cb) => market.subscribeSymbol(symbol, cb),
    () => market.getRow(symbol),
    () => market.getRow(symbol),
  );
}

let cachedSymbols: string[] = [];
let cachedSize = -1;
function symbolsSnapshot(): string[] {
  if (market.rows.size !== cachedSize) {
    cachedSymbols = Array.from(market.rows.keys()).sort();
    cachedSize = market.rows.size;
  }
  return cachedSymbols;
}
export function useAllSymbols(): string[] {
  return useSyncExternalStore(
    (cb) => market.subscribeGlobal(cb),
    symbolsSnapshot,
    symbolsSnapshot,
  );
}

export function useConnState(): { state: ConnState; rtt: number; lastMsgAt: number } {
  // IMPORTANT: getSnapshot must return a stable reference.
  return useSyncExternalStore(
    (cb) => conn.subscribe(cb),
    () => conn.getSnap(),
    () => conn.getSnap(),
  );
}
