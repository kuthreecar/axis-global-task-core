import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Position = { s: string; qty: number; avg: number };

type UserState = {
  watchlist: string[];
  positions: Position[];
  addWatch: (s: string) => void;
  removeWatch: (s: string) => void;
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
      addFill: (s, qty, px) => set((st) => {
        const existing = st.positions.find((p) => p.s === s);
        if (!existing) return { ...st, positions: [...st.positions, { s, qty, avg: px }] };
        const newQty = existing.qty + qty;
        let newAvg = existing.avg;
        if (Math.sign(existing.qty) !== Math.sign(newQty) || existing.qty === 0) newAvg = px;
        else if (Math.sign(qty) === Math.sign(existing.qty))
          newAvg = (existing.avg * Math.abs(existing.qty) + px * Math.abs(qty)) / Math.abs(newQty || 1);
        const positions = newQty === 0
          ? st.positions.filter((p) => p.s !== s)
          : st.positions.map((p) => p.s === s ? { s, qty: newQty, avg: newAvg } : p);
        return { ...st, positions };
      }),
      resetPortfolio: () => set((st) => ({ ...st, positions: DEFAULT_POSITIONS })),
    }),
    {
      name: "axis-user-v1",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
