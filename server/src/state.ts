import type { AssetDiff, AssetSnapshot } from "./protocol.js";

// Central in-memory state of all assets, plus a bounded ring buffer of
// recent diff batches keyed by monotonic sequence number for client backfill.

type AssetRow = {
  s: string;
  p: number;
  o?: number;
  v?: number;
  f?: number;
  oi?: number;
};

export type DiffBatch = { seq: number; ts: number; changes: AssetDiff[] };

const RING_CAPACITY = 1024; // ~50-100s of history at our batch cadence

export class MarketState {
  private rows = new Map<string, AssetRow>();
  // Pending changes accumulated since the last flush (per-symbol coalesced).
  private pending = new Map<string, AssetDiff>();
  private seq = 0;
  private ring: DiffBatch[] = [];
  private listeners = new Set<(b: DiffBatch) => void>();

  /** Returns the current monotonic sequence number (last flushed). */
  currentSeq(): number {
    return this.seq;
  }

  /** Full snapshot for a brand-new client. */
  snapshot(): { seq: number; ts: number; assets: AssetSnapshot[] } {
    const assets: AssetSnapshot[] = [];
    for (const r of this.rows.values()) assets.push({ ...r });
    return { seq: this.seq, ts: Date.now(), assets };
  }

  /** Return all diff batches with seq > sinceSeq, or null if too old. */
  replaySince(sinceSeq: number): DiffBatch[] | null {
    if (this.ring.length === 0) return [];
    const oldest = this.ring[0].seq;
    if (sinceSeq < oldest - 1) return null; // too far behind -> resync
    return this.ring.filter((b) => b.seq > sinceSeq);
  }

  /** Apply an incoming update from the upstream feed. Coalesces in pending. */
  ingest(update: AssetDiff) {
    const cur = this.rows.get(update.s) ?? { s: update.s, p: 0 };
    let changed = false;
    if (update.p !== undefined && update.p !== cur.p) { cur.p = update.p; changed = true; }
    if (update.o !== undefined && update.o !== cur.o) { cur.o = update.o; changed = true; }
    if (update.v !== undefined && update.v !== cur.v) { cur.v = update.v; changed = true; }
    if (update.f !== undefined && update.f !== cur.f) { cur.f = update.f; changed = true; }
    if (update.oi !== undefined && update.oi !== cur.oi) { cur.oi = update.oi; changed = true; }
    if (!changed && this.rows.has(update.s)) return;
    this.rows.set(update.s, cur);

    // Coalesce: merge with any pending diff for this symbol.
    const prev = this.pending.get(update.s);
    if (prev) {
      this.pending.set(update.s, { ...prev, ...update });
    } else {
      this.pending.set(update.s, { ...update });
    }
  }

  /** Flush pending changes as a single diff batch. Called on a timer. */
  flush(): DiffBatch | null {
    if (this.pending.size === 0) return null;
    this.seq += 1;
    const batch: DiffBatch = {
      seq: this.seq,
      ts: Date.now(),
      changes: Array.from(this.pending.values()),
    };
    this.pending.clear();
    this.ring.push(batch);
    if (this.ring.length > RING_CAPACITY) this.ring.shift();
    for (const l of this.listeners) l(batch);
    return batch;
  }

  onBatch(fn: (b: DiffBatch) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  symbols(): string[] {
    return Array.from(this.rows.keys());
  }
}
