import { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../userStore";
import { PriceCell, fmtPx, ChangeCell, fmtCompact } from "../components/PriceCell";
import { market } from "../market";

type Sort = "sym" | "last" | "chg" | "vol";

// Per-row P&L cells subscribe to one symbol each → minimal re-renders.
function PnlCell({ symbol, qty, avg }: { symbol: string; qty: number; avg: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const render = () => {
      const r = market.getRow(symbol);
      if (!r) { el.textContent = "—"; return; }
      const pnl = (r.p - avg) * qty;
      el.textContent = (pnl >= 0 ? "+" : "") + "$" + fmtPx(Math.abs(pnl)).replace(/^-/, "");
      el.className = "pnl " + (pnl >= 0 ? "pos" : "neg");
    };
    render();
    return market.subscribeSymbol(symbol, render);
  }, [symbol, qty, avg]);
  return <span ref={ref} className="pnl">—</span>;
}

function NotionalCell({ symbol, qty }: { symbol: string; qty: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const render = () => {
      const r = market.getRow(symbol);
      if (!r) { el.textContent = "—"; return; }
      const v = r.p * qty;
      el.textContent = "$" + fmtPx(Math.abs(v));
    };
    render();
    return market.subscribeSymbol(symbol, render);
  }, [symbol, qty]);
  return <span ref={ref}>—</span>;
}

// Portfolio total: subscribe to every held symbol, but coalesce updates via
// requestAnimationFrame so we update at most once per frame regardless of
// how many symbols ticked.
function PortfolioTotals({ positions }: { positions: { s: string; qty: number; avg: number }[] }) {
  const valRef = useRef<HTMLSpanElement>(null);
  const pnlRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const compute = () => {
      let value = 0, cost = 0;
      for (const p of positions) {
        const r = market.getRow(p.s);
        if (!r) continue;
        value += r.p * p.qty;
        cost += p.avg * p.qty;
      }
      const pnl = value - cost;
      if (valRef.current) valRef.current.textContent = "$" + fmtPx(value);
      if (pnlRef.current) {
        pnlRef.current.textContent = (pnl >= 0 ? "+" : "−") + "$" + fmtPx(Math.abs(pnl));
        pnlRef.current.className = "total-pnl " + (pnl >= 0 ? "pos" : "neg");
      }
    };

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; compute(); });
    };

    const unsubs = positions.map((p) => market.subscribeSymbol(p.s, schedule));
    compute();
    return () => { for (const u of unsubs) u(); };
  }, [positions]);

  return (
    <div className="totals">
      <div className="total-box">
        <div className="lbl">Portfolio Value</div>
        <div className="val"><span ref={valRef}>—</span></div>
      </div>
      <div className="total-box">
        <div className="lbl">Unrealized P&amp;L</div>
        <div className="val"><span ref={pnlRef} className="total-pnl">—</span></div>
      </div>
    </div>
  );
}

export function Portfolio() {
  const { positions, addFill, resetPortfolio } = useUser();
  const [showAdd, setShowAdd] = useState(false);
  const [sort, setSort] = useState<Sort>("vol");

  const sorted = useMemo(() => {
    const list = [...positions];
    list.sort((a, b) => {
      const ra = market.getRow(a.s), rb = market.getRow(b.s);
      if (sort === "sym") return a.s.localeCompare(b.s);
      if (sort === "last") return (rb?.p ?? 0) - (ra?.p ?? 0);
      if (sort === "chg") {
        const ca = ra && ra.o ? (ra.p - ra.o) / ra.o : 0;
        const cb = rb && rb.o ? (rb.p - rb.o) / rb.o : 0;
        return cb - ca;
      }
      if (sort === "vol") return (rb?.v ?? 0) - (ra?.v ?? 0);
      return 0;
    });
    return list;
  }, [positions, sort]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Portfolio</h1>
        <div className="row">
          <button onClick={() => setShowAdd((v) => !v)}>+ Mock fill</button>
          <button className="ghost" onClick={resetPortfolio}>Reset</button>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="vol">Sort: Volume</option>
            <option value="chg">Sort: 24h Change</option>
            <option value="last">Sort: Last</option>
            <option value="sym">Sort: Symbol</option>
          </select>
        </div>
      </div>
      {showAdd && <AddFillForm onAdd={(s, q, px) => { addFill(s, q, px); setShowAdd(false); }} />}
      <PortfolioTotals positions={sorted} />
      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th>
            <th className="num">Qty</th>
            <th className="num">Avg Cost</th>
            <th className="num">Last</th>
            <th className="num">24h Change</th>
            <th className="num">24h Volume</th>
            <th className="num">Notional</th>
            <th className="num">Unrealized P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const r = market.getRow(p.s);
            return (
              <tr key={p.s}>
                <td><Link to={`/asset/${encodeURIComponent(p.s)}`} className="sym">{p.s}</Link></td>
                <td className="num">{p.qty}</td>
                <td className="num">${fmtPx(p.avg)}</td>
                <td className="num"><PriceCell symbol={p.s} /></td>
                <td className="num"><ChangeCell symbol={p.s} /></td>
                <td className="num muted">{r?.v ? fmtCompact(r.v) : "—"}</td>
                <td className="num"><NotionalCell symbol={p.s} qty={p.qty} /></td>
                <td className="num"><PnlCell symbol={p.s} qty={p.qty} avg={p.avg} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddFillForm({ onAdd }: { onAdd: (s: string, q: number, px: number) => void }) {
  const [s, setS] = useState("BTC");
  const [q, setQ] = useState("0.1");
  const [px, setPx] = useState("");
  return (
    <div className="add-fill">
      <input placeholder="Symbol" value={s} onChange={(e) => setS(e.target.value.toUpperCase())} />
      <input placeholder="Qty (negative=short)" value={q} onChange={(e) => setQ(e.target.value)} />
      <input
        placeholder={market.getRow(s) ? `Px (mkt: ${market.getRow(s)?.p})` : "Px"}
        value={px}
        onChange={(e) => setPx(e.target.value)}
      />
      <button onClick={() => {
        const qty = parseFloat(q);
        const price = px ? parseFloat(px) : market.getRow(s)?.p;
        if (!qty || !price) return;
        onAdd(s, qty, price);
      }}>Add</button>
    </div>
  );
}
