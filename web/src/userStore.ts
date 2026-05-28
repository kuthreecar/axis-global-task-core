// User-side state: watchlist + mock portfolio. Persisted to localStorage.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Position = {
  s: string;     // symbol
  qty: number;   // signed (negative = short)
  avg: number;   // avg cost
};

type UserState = {
  watchlist: string[];
  positions: Position[];
  addWatch: (s: string) => void;
  removeWatch: (s: string) => void;
  setWatchlist: (ss: string[]) => void;
  addFill: (s: string, qty: number, px: number) => void;
  resetPortfolio: () => void;
};

const DEFAULT_WATCH = ["BTC", "ETH", "SOL", "HYPE", "ARB", "AVAX", "DOGE", "SUI", "APT", "OP", "MATIC", "LINK", "ATOM", "INJ", "TIA", "SEI", "JUP", "BNB", "XRP", "LTC", "BCH", "FIL", "NEAR", "ADA", "FTM", "RNDR", "PEPE", "WIF", "WLD", "ORDI"];

const DEFAULT_POSITIONS: Position[] = [
  { s: "BTC", qty: 0.5, avg: 65000 },
  { s: "ETH", qty: 4, avg: 3200 },
  { s: "SOL", qty: 50, avg: 150 },
  { s: "HYPE", qty: 500, avg: 20 },
  { s: "DOGE", qty: -10000, avg: 0.18 },
];

export const useUser = create<UserState>()(
  persist(
    (set) => ({
      watchlist: DEFAULT_WATCH,
      positions: DEFAULT_POSITIONS,
      addWatch: (s) => set((st) => st.watchlist.includes(s) ? st : { ...st, watchlist: [...st.watchlist, s] }),
      removeWatch: (s) => set((st) => ({ ...st, watchlist: st.watchlist.filter((x) => x !== s) })),
      setWatchlist: (ss) => set((st) => ({ ...st, watchlist: ss })),
      addFill: (s, qty, px) => set((st) => {
        const existing = st.positions.find((p) => p.s === s);
        if (!existing) {
          return { ...st, positions: [...st.positions, { s, qty, avg: px }] };
        }
        const newQty = existing.qty + qty;
        // If sign flips or position closes, reset avg; else weighted average.
        let newAvg = existing.avg;
        if (Math.sign(existing.qty) !== Math.sign(newQty) || existing.qty === 0) {
          newAvg = px;
        } else if (Math.sign(qty) === Math.sign(existing.qty)) {
          // Adding to same side: weighted avg
          newAvg = (existing.avg * Math.abs(existing.qty) + px * Math.abs(qty)) / Math.abs(newQty || 1);
        }
        const positions = newQty === 0
          ? st.positions.filter((p) => p.s !== s)
          : st.positions.map((p) => p.s === s ? { s, qty: newQty, avg: newAvg } : p);
        return { ...st, positions };
      }),
      resetPortfolio: () => set((st) => ({ ...st, positions: DEFAULT_POSITIONS })),
    }),
    { name: "axis-user-v1" }
  )
);
