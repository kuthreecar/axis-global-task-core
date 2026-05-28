import { Text, View } from "react-native";
import { useConnState } from "../hooks";

const COLOR = {
  connected: "#29d391",
  connecting: "#f0b94a",
  reconnecting: "#f0b94a",
  stale: "#ff5470",
  offline: "#ff5470",
};

export function ConnectionBadge() {
  const { state, rtt, lastMsgAt } = useConnState();
  const age = lastMsgAt ? Math.max(0, Date.now() - lastMsgAt) : 0;
  const label = {
    connecting: "Connecting…",
    connected: `Live · ${rtt || "—"}ms`,
    reconnecting: "Reconnecting…",
    stale: `Stale · ${(age / 1000).toFixed(0)}s`,
    offline: "Offline",
  }[state];
  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
      backgroundColor: "#161a24", borderWidth: 1, borderColor: "#1e2230",
      flexDirection: "row", alignItems: "center", gap: 6,
    }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLOR[state] }} />
      <Text style={{ fontSize: 11, color: COLOR[state], fontWeight: "500" }}>{label}</Text>
    </View>
  );
}
