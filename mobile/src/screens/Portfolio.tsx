import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useUser } from "../userStore";
import { PriceCell, fmtPx } from "../components/PriceCell";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { market } from "../market";
import { C } from "../theme";

// Per-row P&L cell — subscribes to one symbol, plain state update is fine
// because only this cell re-renders per tick.
function PnlCell({ symbol, qty, avg }: { symbol: string; qty: number; avg: number }) {
  const [{ text, pos }, set] = useState(() => compute());
  useEffect(() => {
    set(compute());
    return market.subscribeSymbol(symbol, () => set(compute()));
  }, [symbol, qty, avg]);
  function compute() {
    const r = market.getRow(symbol);
    if (!r) return { text: "—", pos: null as null | boolean };
    const pnl = (r.p - avg) * qty;
    return { text: (pnl >= 0 ? "+" : "−") + "$" + fmtPx(Math.abs(pnl)), pos: pnl >= 0 };
  }
  return <Text style={{ color: pos === null ? C.muted : pos ? C.pos : C.neg, fontVariant: ["tabular-nums"], fontWeight: "600", textAlign: "right" }}>{text}</Text>;
}

function PortfolioTotals({ positions }: { positions: { s: string; qty: number; avg: number }[] }) {
  const [val, setVal] = useState("—");
  const [pnl, setPnl] = useState<{ text: string; pos: boolean | null }>({ text: "—", pos: null });
  const scheduled = useRef(false);

  useEffect(() => {
    const compute = () => {
      let value = 0, cost = 0;
      for (const p of positions) {
        const r = market.getRow(p.s);
        if (!r) continue;
        value += r.p * p.qty;
        cost += p.avg * p.qty;
      }
      const d = value - cost;
      setVal("$" + fmtPx(value));
      setPnl({ text: (d >= 0 ? "+" : "−") + "$" + fmtPx(Math.abs(d)), pos: d >= 0 });
    };
    // Coalesce: at most one recompute per animation frame
    const schedule = () => {
      if (scheduled.current) return;
      scheduled.current = true;
      requestAnimationFrame(() => { scheduled.current = false; compute(); });
    };
    const unsubs = positions.map((p) => market.subscribeSymbol(p.s, schedule));
    compute();
    return () => { for (const u of unsubs) u(); };
  }, [positions]);

  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
      <View style={styles.totalBox}>
        <Text style={styles.totalLbl}>Portfolio Value</Text>
        <Text style={styles.totalVal}>{val}</Text>
      </View>
      <View style={styles.totalBox}>
        <Text style={styles.totalLbl}>Unrealized P&amp;L</Text>
        <Text style={[styles.totalVal, { color: pnl.pos === null ? C.text : pnl.pos ? C.pos : C.neg }]}>{pnl.text}</Text>
      </View>
    </View>
  );
}

export function PortfolioScreen({ navigation }: any) {
  const { positions, addFill, resetPortfolio } = useUser();
  const [showAdd, setShowAdd] = useState(false);
  const [s, setS] = useState("BTC");
  const [q, setQ] = useState("0.1");
  const [px, setPx] = useState("");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio</Text>
        <ConnectionBadge />
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <Pressable style={styles.btn} onPress={() => setShowAdd((v) => !v)}>
          <Text style={styles.btnText}>{showAdd ? "Close" : "+ Mock fill"}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => Alert.alert("Reset portfolio?", "Restore default positions.", [
            { text: "Cancel", style: "cancel" },
            { text: "Reset", style: "destructive", onPress: resetPortfolio },
          ])}
        >
          <Text style={styles.btnText}>Reset</Text>
        </Pressable>
      </View>

      {showAdd && (
        <View style={styles.addRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={s} onChangeText={(t) => setS(t.toUpperCase())} autoCapitalize="characters" placeholder="SYM" placeholderTextColor={C.muted} />
          <TextInput style={[styles.input, { flex: 1 }]} value={q} onChangeText={setQ} keyboardType="numeric" placeholder="Qty" placeholderTextColor={C.muted} />
          <TextInput style={[styles.input, { flex: 1 }]} value={px} onChangeText={setPx} keyboardType="numeric" placeholder={market.getRow(s) ? `${market.getRow(s)?.p}` : "Px"} placeholderTextColor={C.muted} />
          <Pressable
            style={styles.btn}
            onPress={() => {
              const qty = parseFloat(q);
              const price = px ? parseFloat(px) : market.getRow(s)?.p;
              if (!qty || !price) return;
              addFill(s, qty, price);
              setShowAdd(false);
            }}
          >
            <Text style={styles.btnText}>Add</Text>
          </Pressable>
        </View>
      )}

      <PortfolioTotals positions={positions} />

      <FlatList
        data={positions}
        keyExtractor={(p) => p.s}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("Asset", { symbol: item.s })}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.sym}>{item.s}</Text>
              <Text style={styles.subtle}>{item.qty} @ ${fmtPx(item.avg)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <PriceCell symbol={item.s} />
              <PnlCell symbol={item.s} qty={item.qty} avg={item.avg} />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={[styles.subtle, { textAlign: "center", padding: 20 }]}>No positions. Tap “+ Mock fill”.</Text>}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 8 },
  title: { color: C.text, fontSize: 22, fontWeight: "700" },
  totalBox: { flex: 1, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 10, padding: 14 },
  totalLbl: { color: C.muted, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  totalVal: { color: C.text, fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", paddingVertical: 12, borderBottomColor: C.line, borderBottomWidth: 0.5 },
  sym: { color: C.accent, fontSize: 16, fontWeight: "600" },
  subtle: { color: C.muted, fontSize: 12, marginTop: 2 },
  btn: { backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnGhost: { backgroundColor: "transparent" },
  btnText: { color: C.text, fontWeight: "500" },
  addRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  input: { backgroundColor: C.panel2, color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontVariant: ["tabular-nums"] },
});
