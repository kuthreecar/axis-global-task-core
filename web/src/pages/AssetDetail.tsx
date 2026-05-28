import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { conn, market } from "../market";
import { PriceCell, ChangeCell, fmtPx } from "../components/PriceCell";
import { useUser } from "../userStore";

export function AssetDetail() {
  const { symbol = "" } = useParams();
  const s = decodeURIComponent(symbol);
  const { addWatch, watchlist, removeWatch } = useUser();
  const watched = watchlist.includes(s);

  useEffect(() => {
    conn.refBook(s);
    return () => conn.unrefBook(s);
  }, [s]);

  return (
    <div className="page">
      <div className="page-head">
        <h1><Link to="/" className="back">←</Link> {s}</h1>
        <div className="row">
          <button onClick={() => watched ? removeWatch(s) : addWatch(s)}>
            {watched ? "★ In watchlist" : "☆ Add to watchlist"}
          </button>
        </div>
      </div>

      <div className="detail-top">
        <div className="big-price"><PriceCell symbol={s} /></div>
        <div className="big-change"><ChangeCell symbol={s} /></div>
        <MetaGrid symbol={s} />
      </div>

      <div className="book-wrap">
        <h2>Order book (top 15)</h2>
        <OrderBook symbol={s} />
      </div>
    </div>
  );
}

function MetaGrid({ symbol }: { symbol: string }) {
  const volRef = useRef<HTMLSpanElement>(null);
  const oiRef = useRef<HTMLSpanElement>(null);
  const fRef = useRef<HTMLSpanElement>(null);
  const oRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const render = () => {
      const r = market.getRow(symbol);
      if (!r) return;
      if (volRef.current) volRef.current.textContent = r.v ? "$" + fmtPx(r.v) : "—";
      if (oiRef.current) oiRef.current.textContent = r.oi ? fmtPx(r.oi) : "—";
      if (fRef.current) fRef.current.textContent = r.f !== undefined ? (r.f * 100).toFixed(4) + "%" : "—";
      if (oRef.current) oRef.current.textContent = r.o ? "$" + fmtPx(r.o) : "—";
    };
    render();
    return market.subscribeSymbol(symbol, render);
  }, [symbol]);
  return (
    <div className="meta-grid">
      <div><div className="lbl">24h Volume</div><div><span ref={volRef}>—</span></div></div>
      <div><div className="lbl">Open Interest</div><div><span ref={oiRef}>—</span></div></div>
      <div><div className="lbl">Funding (hourly)</div><div><span ref={fRef}>—</span></div></div>
      <div><div className="lbl">Prev day</div><div><span ref={oRef}>—</span></div></div>
    </div>
  );
}

function OrderBook({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<{ bids: [number, number][]; asks: [number, number][]; ts: number } | null>(null);
  useEffect(() => {
    return market.subscribeBook(symbol, setBook);
  }, [symbol]);

  if (!book) return <div className="muted">Waiting for book…</div>;
  const maxSz = Math.max(
    ...book.bids.slice(0, 10).map((l) => l[1]),
    ...book.asks.slice(0, 10).map((l) => l[1]),
    1
  );
  return (
    <div className="book">
      <div className="book-side asks">
        {book.asks.slice(0, 10).reverse().map(([px, sz], i) => (
          <div key={i} className="lvl">
            <div className="bar bar-ask" style={{ width: `${(sz / maxSz) * 100}%` }} />
            <span className="px">{fmtPx(px)}</span>
            <span className="sz">{sz.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="book-mid">
        <span className="sym">{symbol}</span>
        <span className="spread">
          spread {book.bids[0] && book.asks[0]
            ? fmtPx(book.asks[0][0] - book.bids[0][0])
            : "—"}
        </span>
      </div>
      <div className="book-side bids">
        {book.bids.slice(0, 10).map(([px, sz], i) => (
          <div key={i} className="lvl">
            <div className="bar bar-bid" style={{ width: `${(sz / maxSz) * 100}%` }} />
            <span className="px">{fmtPx(px)}</span>
            <span className="sz">{sz.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
