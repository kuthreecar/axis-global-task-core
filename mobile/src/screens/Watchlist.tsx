import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useUser } from "../userStore";
import { PriceCell, ChangeCell } from "../components/PriceCell";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { useAllSymbols } from "../hooks";
import { C } from "../theme";

export function WatchlistScreen({ navigation }: any) {
  const { watchlist, addWatch, removeWatch } = useUser();
  const all = useAllSymbols();
  const [q, setQ] = useState("");

  const suggestions = useMemo(() => {
    if (!q) return [];
    const ql = q.toLowerCase();
    return all.filter((s) => s.toLowerCase().includes(ql) && !watchlist.includes(s)).slice(0, 6);
  }, [q, all, watchlist]);

  const renderItem = useCallback(({ item }: { item: string }) => (
    <Pressable
      onPress={() => navigation.navigate("Asset", { symbol: item })}
      onLongPress={() => removeWatch(item)}
      style={styles.row}
    >
      <Text style={styles.sym}>{item}</Text>
      <View style={styles.right}>
        <PriceCell symbol={item} />
        <ChangeCell symbol={item} />
      </View>
    </Pressable>
  ), [navigation, removeWatch]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Watchlist</Text>
        <ConnectionBadge />
      </View>
      <View style={styles.searchWrap}>
        <TextInput
          placeholder={`Add symbol… (${all.length} available)`}
          placeholderTextColor={C.muted}
          value={q}
          onChangeText={setQ}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
        {suggestions.length > 0 && (
          <View style={styles.suggest}>
            {suggestions.map((s) => (
              <Pressable key={s} onPress={() => { addWatch(s); setQ(""); }} style={styles.suggestItem}>
                <Text style={{ color: C.text }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <FlatList
        data={watchlist}
        keyExtractor={(s) => s}
        renderItem={renderItem}
        windowSize={10}
        removeClippedSubviews
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
      <Text style={styles.hint}>Tip: long-press a row to remove.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 8 },
  title: { color: C.text, fontSize: 22, fontWeight: "700" },
  searchWrap: { marginBottom: 8, position: "relative", zIndex: 5 },
  input: { backgroundColor: C.panel2, color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  suggest: { position: "absolute", top: 44, left: 0, right: 0, backgroundColor: C.panel2, borderColor: C.line, borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  suggestItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomColor: C.line, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomColor: C.line, borderBottomWidth: StyleSheet.hairlineWidth },
  sym: { color: C.accent, fontSize: 16, fontWeight: "600" },
  right: { alignItems: "flex-end" },
  hint: { color: C.muted, fontSize: 11, textAlign: "center", paddingVertical: 6 },
});
