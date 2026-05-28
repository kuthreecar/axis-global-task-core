import { useEffect, useRef } from "react";
import { market } from "../market";

// Format a number with adaptive decimals depending on magnitude.
export function fmtPx(p: number): string {
  if (!isFinite(p) || p === 0) return "—";
  const abs = Math.abs(p);
  let dec = 2;
  if (abs < 0.0001) dec = 8;
  else if (abs < 0.01) dec = 6;
  else if (abs < 1) dec = 4;
  else if (abs < 100) dec = 3;
  else dec = 2;
  return p.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Format large numbers compactly (e.g., 1.2M, 3.4B, 567K)
export function fmtCompact(n: number): string {
  if (!isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

// Direct-DOM tick rendering. We do NOT setState here; instead we mutate
// textContent and toggle a CSS class. This keeps 30+ symbols at 5Hz buttery.
// Animation: smooth interpolation between previous and target value over ~200ms
// using requestAnimationFrame, plus a brief flash on tick direction.
type Props = {
  symbol: string;
  className?: string;
  // If true, animate interpolation between updates. Default true.
  animate?: boolean;
};

export function PriceCell({ symbol, className, animate = true }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // Track animation target/source for smooth interpolation
  const animState = useRef<{ from: number; to: number; t0: number; raf: number | null }>({
    from: 0, to: 0, t0: 0, raf: null,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const initial = market.getRow(symbol);
    if (initial) {
      el.textContent = fmtPx(initial.p);
      animState.current.from = initial.p;
      animState.current.to = initial.p;
    }

    const step = () => {
      const a = animState.current;
      const dur = 180; // ms
      const elapsed = performance.now() - a.t0;
      const k = Math.min(1, elapsed / dur);
      // ease-out cubic
      const e = 1 - Math.pow(1 - k, 3);
      const v = a.from + (a.to - a.from) * e;
      if (el) el.textContent = fmtPx(v);
      if (k < 1) {
        a.raf = requestAnimationFrame(step);
      } else {
        a.raf = null;
      }
    };

    const unsub = market.subscribeSymbol(symbol, () => {
      const row = market.getRow(symbol);
      if (!row || !el) return;
      const target = row.p;
      const prev = animState.current.to;
      // Flash direction class
      if (target > prev) {
        el.classList.remove("flash-down");
        // restart animation by toggling class
        el.classList.remove("flash-up");
        // force reflow to restart CSS animation
        void el.offsetWidth;
        el.classList.add("flash-up");
      } else if (target < prev) {
        el.classList.remove("flash-up");
        el.classList.remove("flash-down");
        void el.offsetWidth;
        el.classList.add("flash-down");
      }

      if (!animate) {
        el.textContent = fmtPx(target);
        animState.current.from = target;
        animState.current.to = target;
        return;
      }

      animState.current.from = prev;
      animState.current.to = target;
      animState.current.t0 = performance.now();
      if (animState.current.raf == null) animState.current.raf = requestAnimationFrame(step);
    });

    return () => {
      unsub();
      if (animState.current.raf != null) cancelAnimationFrame(animState.current.raf);
    };
  }, [symbol, animate]);

  return <span ref={ref} className={`price-cell ${className ?? ""}`}>—</span>;
}

// Cell rendering 24h change %. Subscribes to symbol; updates on every tick
// because price changes implicitly change the %.
export function ChangeCell({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const render = () => {
      const r = market.getRow(symbol);
      if (!r || !r.o) { el.textContent = "—"; el.className = "change-cell"; return; }
      const pct = ((r.p - r.o) / r.o) * 100;
      el.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
      el.className = "change-cell " + (pct >= 0 ? "pos" : "neg");
    };
    render();
    return market.subscribeSymbol(symbol, render);
  }, [symbol]);
  return <span ref={ref} className="change-cell">—</span>;
}
