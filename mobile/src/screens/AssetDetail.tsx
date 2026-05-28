import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { conn, market } from "../market";
import { PriceCell, ChangeCell, fmtPx } from "../components/PriceCell";
import { useUser } from "../userStore";
import { C } from "../theme";

export function AssetDetailScreen({ route }: any) {
  const symbol: string = route.params.symbol;
  const { addWatch, removeWatch, watchlist } = useUser();
  const watched = watchlist.includes(symbol);
  const [book, setBook] = useState<{ bids: [number, number][]; asks: [number, number][]; ts: number } | null>(null);
  const [meta, setMeta] = useState(() => snap(symbol));

  useEffect(() => {
    conn.refBook(symbol);
    const u1 = market.subscribeBook(symbol, setBook);
    const u2 = market.subscribeSymbol(symbol, () => setMeta(snap(symbol)));
    return () => { conn.unrefBook(symbol); u1(); u2(); };
  }, [symbol]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.headerCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.sym}>{symbol}</Text>
          <Pressable
            style={styles.starBtn}
            onPress={() => watched ? removeWatch(symbol) : addWatch(symbol)}
          >
            <Text style={{ color: C.text }}>{watched ? "★ In watchlist" : "☆ Add to watchlist"}</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 14, alignItems: "flex-start" }}>
          <PriceCell symbol={symbol} size={34} align="left" bold />
        </View>
        <View style={{ marginTop: 6 }}>
          <ChangeCell symbol={symbol} size={16} />
        </View>
        <View style={styles.metaGrid}>
          <Meta lbl="24h Volume" val={meta.vol} />
          <Meta lbl="Open Interest" val={meta.oi} />
          <Meta lbl="Funding (hr)" val={meta.f} />
          <Meta lbl="Prev day" val={meta.prev} />
        </View>
      </View>

      <Text style={styles.h2}>Order book (top 10)</Text>
      <View style={styles.bookCard}>
        {!book ? (
          <Text style={{ color: C.muted, textAlign: "center", padding: 20 }}>Waiting for book…</Text>
        ) : (
          <Book book={book} />
        )}
      </View>
    </ScrollView>
  );
}

function Meta({ lbl, val }: { lbl: string; val: string }) {
  return (
    <View style={{ width: "50%", paddingVertical: 8 }}>
      <Text style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</Text>
      <Text style={{ color: C.text, fontSize: 14, fontVariant: ["tabular-nums"], marginTop: 2 }}>{val}</Text>
    </View>
  );
}

function snap(symbol: string) {
  const r = market.getRow(symbol);
  return {
    vol: r?.v ? "$" + fmtPx(r.v) : "—",
    oi: r?.oi ? fmtPx(r.oi) : "—",
    f: r?.f !== undefined ? (r.f * 100).toFixed(4) + "%" : "—",
    prev: r?.o ? "$" + fmtPx(r.o) : "—",
  };
}

function Book({ book }: { book: { bids: [number, number][]; asks: [number, number][] } }) {
  const maxSz = Math.max(
    ...book.bids.slice(0, 10).map((l) => l[1]),
    ...book.asks.slice(0, 10).map((l) => l[1]),
    1,
  );
  return (
    <View>
      {book.asks.slice(0, 10).reverse().map(([px, sz], i) => (
        <Level key={"a" + i} px={px} sz={sz} maxSz={maxSz} side="ask" />
      ))}
      <View style={styles.spread}>
        <Text style={{ color: C.muted }}>spread</Text>
        <Text style={{ color: C.text, fontVariant: ["tabular-nums"] }}>
          {book.bids[0] && book.asks[0] ? fmtPx(book.asks[0][0] - book.bids[0][0]) : "—"}
        </Text>
      </View>
      {book.bids.slice(0, 10).map(([px, sz], i) => (
        <Level key={"b" + i} px={px} sz={sz} maxSz={maxSz} side="bid" />
      ))}
    </View>
  );
}

function Level({ px, sz, maxSz, side }: { px: number; sz: number; maxSz: number; side: "bid" | "ask" }) {
  const color = side === "bid" ? C.pos : C.neg;
  return (
    <View style={{ flexDirection: "row", paddingVertical: 4, paddingHorizontal: 8, position: "relative" }}>
      <View style={{
        position: "absolute", right: 0, top: 0, bottom: 0,
        width: `${(sz / maxSz) * 100}%`, backgroundColor: color, opacity: 0.12,
      }} />
      <Text style={{ flex: 1, color, fontVariant: ["tabular-nums"], fontWeight: "500" }}>{fmtPx(px)}</Text>
      <Text style={{ color: C.muted, fontVariant: ["tabular-nums"] }}>{sz.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 14 },
  sym: { color: C.text, fontSize: 22, fontWeight: "700" },
  starBtn: { backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 16 },
  h2: { color: C.muted, fontSize: 12, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  bookCard: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 8 },
  spread: { flexDirection: "row", justifyContent: "space-between", backgroundColor: C.panel2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginVertical: 4 },
});
