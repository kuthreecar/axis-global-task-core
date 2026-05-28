import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { market } from "../market";

export function fmtPx(p: number): string {
  if (!isFinite(p) || p === 0) return "—";
  const abs = Math.abs(p);
  let dec = 2;
  if (abs < 0.0001) dec = 8;
  else if (abs < 0.01) dec = 6;
  else if (abs < 1) dec = 4;
  else if (abs < 100) dec = 3;
  return p.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

type Props = {
  symbol: string;
  size?: number;
  align?: "left" | "right" | "center";
  bold?: boolean;
};

const POS = "#29d391";
const NEG = "#ff5470";
const TEXT = "#e6e8ee";

// Per-symbol subscribing cell. Re-renders only when *this* symbol ticks.
// Flash animation uses Animated.Value with non-native driver (color anim
// needs JS driver). The flash lifetime is ~500ms so total bridge traffic
// is bounded even with many cells.
function PriceCellInner({ symbol, size = 14, align = "right", bold }: Props) {
  const [text, setText] = useState(() => {
    const r = market.getRow(symbol);
    return r ? fmtPx(r.p) : "—";
  });
  const flash = useRef(new Animated.Value(0)).current; // -1 (down) .. 0 .. +1 (up)
  const lastP = useRef<number>(market.getRow(symbol)?.p ?? 0);

  useEffect(() => {
    let cancelled = false;
    const unsub = market.subscribeSymbol(symbol, () => {
      if (cancelled) return;
      const r = market.getRow(symbol);
      if (!r) return;
      const dir = r.p > lastP.current ? 1 : r.p < lastP.current ? -1 : 0;
      lastP.current = r.p;
      setText(fmtPx(r.p));
      if (dir !== 0) {
        flash.stopAnimation();
        flash.setValue(dir);
        Animated.timing(flash, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }).start();
      }
    });
    return () => { cancelled = true; unsub(); };
  }, [symbol]);

  const bg = flash.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["rgba(255,84,112,0.30)", "rgba(0,0,0,0)", "rgba(41,211,145,0.30)"],
  });
  const fg = flash.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [NEG, TEXT, POS],
  });

  const txtStyle: TextStyle = {
    fontSize: size,
    textAlign: align,
    fontVariant: ["tabular-nums"],
    fontWeight: bold ? "600" : "500",
  };
  const viewStyle: ViewStyle = { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" };

  return (
    <Animated.View style={[viewStyle, { backgroundColor: bg }]}>
      <Animated.Text style={[txtStyle, { color: fg }]}>{text}</Animated.Text>
    </Animated.View>
  );
}
export const PriceCell = React.memo(PriceCellInner);

// 24h change %
function ChangeCellInner({ symbol, size = 13 }: { symbol: string; size?: number }) {
  const [{ text, pos }, set] = useState<{ text: string; pos: boolean | null }>(() => compute(symbol));
  useEffect(() => {
    set(compute(symbol));
    return market.subscribeSymbol(symbol, () => set(compute(symbol)));
  }, [symbol]);
  return (
    <Text style={{ fontSize: size, color: pos === null ? "#8a94a7" : pos ? POS : NEG, fontVariant: ["tabular-nums"], textAlign: "right", fontWeight: "500" }}>
      {text}
    </Text>
  );
}
export const ChangeCell = React.memo(ChangeCellInner);

function compute(symbol: string): { text: string; pos: boolean | null } {
  const r = market.getRow(symbol);
  if (!r || !r.o) return { text: "—", pos: null };
  const pct = ((r.p - r.o) / r.o) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, pos: pct >= 0 };
}

export const colors = { POS, NEG, TEXT };
