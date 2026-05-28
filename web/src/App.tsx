import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Watchlist } from "./pages/Watchlist";
import { Portfolio } from "./pages/Portfolio";
import { AssetDetail } from "./pages/AssetDetail";
import { Markets } from "./pages/Markets";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { conn } from "./market";

export default function App() {
  useEffect(() => { conn.start(); }, []);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">⟁ Axis · Hyperliquid</div>
        <nav>
          <NavLink to="/" end>Watchlist</NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
          <NavLink to="/markets">Markets</NavLink>
        </nav>
        <ConnectionBadge />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Watchlist />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/asset/:symbol" element={<AssetDetail />} />
        </Routes>
      </main>
    </div>
  );
}
