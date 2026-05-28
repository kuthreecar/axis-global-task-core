import { useConnState } from "../hooks";

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
  return <span className={`conn-badge conn-${state}`}>● {label}</span>;
}
