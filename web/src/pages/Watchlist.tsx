import { Link } from "react-router-dom";
import { useUser } from "../userStore";
import { PriceCell, ChangeCell } from "../components/PriceCell";
import { useState, useMemo } from "react";
import { market } from "../market";
import { useAllSymbols } from "../hooks";

type Sort = "sym" | "last" | "chg" | "vol";

export function Watchlist() {
  const { watchlist, addWatch, removeWatch } = useUser();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("vol");
  const all = useAllSymbols();

  const suggestions = q
    ? all.filter((s) => s.toLowerCase().includes(q.toLowerCase()) && !watchlist.includes(s)).slice(0, 8)
    : [];

  const sorted = useMemo(() => {
    const list = [...watchlist];
    list.sort((a, b) => {
      const ra = market.getRow(a), rb = market.getRow(b);
      if (sort === "sym") return a.localeCompare(b);
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
  }, [watchlist, sort]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Watchlist</h1>
        <div className="row">
          <div className="search">
            <input
              placeholder={`Add symbol… (${all.length} available)`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="suggest">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => { addWatch(s); setQ(""); }}>{s}</button>
                ))}
              </div>
            )}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
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
          {sorted.map((s) => {
            const r = market.getRow(s);
            return (
              <tr key={s}>
                <td><Link to={`/asset/${encodeURIComponent(s)}`} className="sym">{s}</Link></td>
                <td className="num"><PriceCell symbol={s} /></td>
                <td className="num"><ChangeCell symbol={s} /></td>
                <td className="num muted">{r?.v ? fmtCompact(r.v) : "—"}</td>
                <td className="num"><button className="x" onClick={() => removeWatch(s)}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function fmtCompact(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
}
