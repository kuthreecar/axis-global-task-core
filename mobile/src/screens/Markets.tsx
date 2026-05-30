import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAllSymbols } from "../hooks";
import { PriceCell, ChangeCell } from "../components/PriceCell";
import { market } from "../market";
import { useUser } from "../userStore";
import { C } from "../theme";

type Sort = "sym" | "last" | "chg" | "vol";

export function MarketsScreen({ navigation }: any) {
  const all = useAllSymbols();
  const { watchlist, addWatch } = useUser();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("vol");

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    let r = all.filter((s) => !q || s.toLowerCase().includes(ql));
    r = r.sort((a, b) => {
      const ra = market.getRow(a), rb = market.getRow(b);
      if (sort === "sym") return a.localeCompare(b);
      if (sort === "last") return (rb?.p ?? 0) - (ra?.p ?? 0);
      if (sort === "vol") return (rb?.v ?? 0) - (ra?.v ?? 0);
      const ca = ra && ra.o ? (ra.p - ra.o) / ra.o : 0;
      const cb = rb && rb.o ? (rb.p - rb.o) / rb.o : 0;
      return cb - ca;
    });
    return r.slice(0, 250);
  }, [all, q, sort]);

  const renderItem = useCallback(({ item }: { item: string }) => (
    <Pressable
      onPress={() => navigation.navigate("Asset", { symbol: item })}
      style={styles.row}
    >
      <Text style={styles.sym}>{item}</Text>
      <View style={styles.right}>
        <PriceCell symbol={item} />
        <ChangeCell symbol={item} />
      </View>
      {!watchlist.includes(item) && (
        <Pressable onPress={() => addWatch(item)} style={styles.add}>
          <Text style={{ color: C.muted, fontSize: 11 }}>+ watch</Text>
        </Pressable>
      )}
    </Pressable>
  ), [navigation, watchlist, addWatch]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Markets <Text style={{ color: C.muted, fontSize: 12 }}>{rows.length}</Text></Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
        <TextInput
          placeholder="Filter…"
          placeholderTextColor={C.muted}
          style={[styles.input, { flex: 1 }]}
          value={q}
          onChangeText={setQ}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {(["vol", "chg", "last", "sym"] as Sort[]).map((s) => (
          <Pressable key={s} style={[styles.tab, sort === s && styles.tabActive]} onPress={() => setSort(s)}>
            <Text style={{ color: sort === s ? C.text : C.muted, fontSize: 12 }}>{s.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(s) => s}
        renderItem={renderItem}
        windowSize={10}
        removeClippedSubviews
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },
  header: { paddingTop: 12, paddingBottom: 8 },
  title: { color: C.text, fontSize: 22, fontWeight: "700" },
  input: { backgroundColor: C.panel2, color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel2 },
  tabActive: { backgroundColor: C.panel, borderColor: C.accent },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomColor: C.line, borderBottomWidth: 0.5 },
  sym: { color: C.accent, fontSize: 15, fontWeight: "600", flex: 1 },
  right: { alignItems: "flex-end", minWidth: 110 },
  add: { paddingHorizontal: 8, paddingVertical: 6, marginLeft: 8, borderRadius: 6, borderWidth: 1, borderColor: C.line },
});
