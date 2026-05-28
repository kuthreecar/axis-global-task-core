import { useSyncExternalStore } from "react";
import { conn, market, type Row, type ConnState } from "./market";

// Subscribe to a single symbol's row. Re-renders only when that symbol ticks.
export function useRow(symbol: string): Row | undefined {
  return useSyncExternalStore(
    (cb) => market.subscribeSymbol(symbol, cb),
    () => market.getRow(symbol),
    () => market.getRow(symbol),
  );
}

// Subscribe to the global symbol set (when symbols are added/removed).
// Returns a cached array; updates only when membership changes.
export function useAllSymbols(): string[] {
  return useSyncExternalStore(
    (cb) => market.subscribeGlobal(cb),
    () => symbolsSnapshot(),
    () => symbolsSnapshot(),
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

export function useConnState(): { state: ConnState; rtt: number; lastMsgAt: number } {
  // IMPORTANT: getSnapshot must return a stable reference between updates,
  // otherwise React loops forever. Conn caches the snapshot internally.
  return useSyncExternalStore(
    (cb) => conn.subscribe(cb),
    () => conn.getSnap(),
    () => conn.getSnap(),
  );
}
