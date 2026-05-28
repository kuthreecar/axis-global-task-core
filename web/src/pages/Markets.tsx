import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAllSymbols } from "../hooks";
import { PriceCell, ChangeCell, fmtCompact } from "../components/PriceCell";
import { market } from "../market";
import { useUser } from "../userStore";

type Sort = "sym" | "last" | "chg" | "vol";

// Full market browser: every symbol the server knows about, filterable.
// Uses per-symbol subscriptions so scrolling a huge list stays fast — only
// cells in view & ticking actually update the DOM.
export function Markets() {
  const all = useAllSymbols();
  const { addWatch, watchlist } = useUser();
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<Sort>("vol");

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    let r = all.filter((s) => !q || s.toLowerCase().includes(ql));
    r = r.sort((a, b) => {
      const ra = market.getRow(a), rb = market.getRow(b);
      if (sortBy === "sym") return a.localeCompare(b);
      if (sortBy === "last") return (rb?.p ?? 0) - (ra?.p ?? 0);
      if (sortBy === "vol") return (rb?.v ?? 0) - (ra?.v ?? 0);
      if (sortBy === "chg") {
        const ca = ra && ra.o ? (ra.p - ra.o) / ra.o : 0;
        const cb = rb && rb.o ? (rb.p - rb.o) / rb.o : 0;
        return cb - ca;
      }
      return 0;
    });
    return r;
  }, [all, q, sortBy]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Markets <span className="count">{rows.length}</span></h1>
        <div className="row">
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as Sort)}>
            <option value="vol">Sort: Volume</option>
            <option value="chg">Sort: 24h Change</option>
            <option value="last">Sort: Last</option>
            <option value="sym">Sort: Symbol</option>
          </select>
        </div>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>Symbol</th>
            <th className="num">Last</th>
            <th className="num">24h Change</th>
            <th className="num">24h Volume</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 250).map((s) => {
            const r = market.getRow(s);
            return (
              <tr key={s}>
                <td><Link to={`/asset/${encodeURIComponent(s)}`} className="sym">{s}</Link></td>
                <td className="num"><PriceCell symbol={s} /></td>
                <td className="num"><ChangeCell symbol={s} /></td>
                <td className="num muted">{r?.v ? fmtCompact(r.v) : "—"}</td>
                <td className="num">
                  {!watchlist.includes(s) && <button className="mini" onClick={() => addWatch(s)}>+ watch</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 250 && <div className="muted pad">Showing top 250 of {rows.length}. Use filter to narrow.</div>}
    </div>
  );
}
