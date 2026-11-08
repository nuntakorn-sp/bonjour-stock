import { useEffect, useRef, useState } from 'react';
import type {
  StockItem,
  ShiftData,
  DailyRecord,
  ReceiptRecord,
  AuditRecord,
  VarianceRecord,
  SaleLine,
} from '../types';
import {
  loadRemoteSnapshot,
  subscribeAll,
  pushStockItems,
  deleteStockItems,
  pushShift,
  pushDaily,
  pushReceipts,
  pushAudit,
  pushVariances,
  pushSaleLines,
} from './sync';

export interface RemoteSyncState {
  items: StockItem[];
  shift: ShiftData;
  daily: DailyRecord[];
  receipts: ReceiptRecord[];
  audit: AuditRecord[];
  variances: VarianceRecord[];
  saleLines: SaleLine[];
}

export interface RemoteSyncSetters {
  setItems: React.Dispatch<React.SetStateAction<StockItem[]>>;
  setShift: React.Dispatch<React.SetStateAction<ShiftData>>;
  setDaily: React.Dispatch<React.SetStateAction<DailyRecord[]>>;
  setReceipts: React.Dispatch<React.SetStateAction<ReceiptRecord[]>>;
  setAudit: React.Dispatch<React.SetStateAction<AuditRecord[]>>;
  setVariances: React.Dispatch<React.SetStateAction<VarianceRecord[]>>;
  setSaleLines: React.Dispatch<React.SetStateAction<SaleLine[]>>;
}

export interface RemoteSyncStatus {
  ready: boolean;
  online: boolean;
  lastError: string | null;
}

/**
 * Loads remote snapshot once authenticated, keeps every table mirrored both ways:
 * - Supabase realtime → React state (so another user's edits appear instantly)
 * - React state changes → debounced upserts back to Supabase (so this user's edits persist)
 *
 * Writes echo back through realtime and become no-ops thanks to the per-row hash.
 */
export function useRemoteSync(
  authReady: boolean,
  state: RemoteSyncState,
  setters: RemoteSyncSetters
): RemoteSyncStatus {
  const [status, setStatus] = useState<RemoteSyncStatus>({
    ready: false,
    online: false,
    lastError: null,
  });

  const readyRef = useRef(false);
  // Last state we observed from the server (or last thing we pushed). Used to compute diffs
  // and to suppress feedback loops when realtime echoes our own writes back to us.
  const hashRef = useRef({
    items: new Map<string, string>(),
    shift: '',
    daily: new Map<string, string>(),
    receipts: new Map<string, string>(),
    audit: new Map<string, string>(),
    variances: new Map<string, string>(),
    saleLines: new Map<string, string>(),
  });

  const stateRef = useRef(state);
  const settersRef = useRef(setters);
  stateRef.current = state;
  settersRef.current = setters;

  // ---- Load + subscribe ----
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;

    (async () => {
      const branch = stateRef.current.shift.branch;
      const snap = await loadRemoteSnapshot(branch);
      if (cancelled) return;

      if (snap) {
        const s = settersRef.current;
        if (snap.items.length) s.setItems(snap.items);
        if (snap.shift) s.setShift(snap.shift);
        if (snap.daily.length) s.setDaily(snap.daily);
        if (snap.receipts.length) s.setReceipts(snap.receipts);
        if (snap.audit.length) s.setAudit(snap.audit);
        if (snap.variances.length) s.setVariances(snap.variances);
        if (snap.saleLines.length) s.setSaleLines(snap.saleLines);

        hashRef.current.items = new Map(snap.items.map((it) => [it.code, JSON.stringify(it)]));
        hashRef.current.shift = snap.shift ? JSON.stringify(snap.shift) : '';
        hashRef.current.daily = new Map(snap.daily.map((d) => [d.date, JSON.stringify(d)]));
        hashRef.current.receipts = new Map(snap.receipts.map((r) => [r.id, JSON.stringify(r)]));
        hashRef.current.audit = new Map(
          snap.audit.map((a) => [String(a.id ?? `${a.ts}-${a.code}-${a.field}`), JSON.stringify(a)])
        );
        hashRef.current.variances = new Map(
          snap.variances.map((v) => [v.id, JSON.stringify(v)])
        );
        hashRef.current.saleLines = new Map(
          snap.saleLines.map((l) => [l.id, JSON.stringify(l)])
        );

        setStatus({ ready: true, online: true, lastError: null });
      } else {
        // Remote unreachable — keep local data and try to seed the server with it.
        setStatus({ ready: true, online: false, lastError: 'offline' });
      }
      readyRef.current = true;

      unsub = subscribeAll(branch, {
        onStockChange: (item, event, code) => {
          if (event === 'DELETE') {
            hashRef.current.items.delete(code);
            settersRef.current.setItems((prev) => prev.filter((o) => o.code !== code));
            return;
          }
          const hash = JSON.stringify(item);
          if (hashRef.current.items.get(code) === hash) return;
          hashRef.current.items.set(code, hash);
          settersRef.current.setItems((prev) => {
            const idx = prev.findIndex((o) => o.code === code);
            if (idx < 0) return [...prev, item];
            const next = prev.slice();
            next[idx] = item;
            return next;
          });
        },
        onShiftChange: (shift) => {
          const hash = JSON.stringify(shift);
          if (hashRef.current.shift === hash) return;
          hashRef.current.shift = hash;
          settersRef.current.setShift(shift);
        },
        onDailyChange: (record, event) => {
          if (event === 'DELETE') {
            hashRef.current.daily.delete(record.date);
            settersRef.current.setDaily((prev) => prev.filter((d) => d.date !== record.date));
            return;
          }
          const hash = JSON.stringify(record);
          if (hashRef.current.daily.get(record.date) === hash) return;
          hashRef.current.daily.set(record.date, hash);
          settersRef.current.setDaily((prev) => {
            const filtered = prev.filter((d) => d.date !== record.date);
            return [record, ...filtered];
          });
        },
        onReceiptChange: (record, event) => {
          if (event === 'DELETE') {
            hashRef.current.receipts.delete(record.id);
            settersRef.current.setReceipts((prev) => prev.filter((r) => r.id !== record.id));
            return;
          }
          const hash = JSON.stringify(record);
          if (hashRef.current.receipts.get(record.id) === hash) return;
          hashRef.current.receipts.set(record.id, hash);
          settersRef.current.setReceipts((prev) => {
            const filtered = prev.filter((r) => r.id !== record.id);
            return [record, ...filtered];
          });
        },
        onAuditChange: (record, event) => {
          const key = String(record.id ?? `${record.ts}-${record.code}-${record.field}`);
          if (event === 'DELETE') {
            hashRef.current.audit.delete(key);
            settersRef.current.setAudit((prev) =>
              prev.filter((a) => String(a.id ?? `${a.ts}-${a.code}-${a.field}`) !== key)
            );
            return;
          }
          const hash = JSON.stringify(record);
          if (hashRef.current.audit.get(key) === hash) return;
          hashRef.current.audit.set(key, hash);
          settersRef.current.setAudit((prev) => {
            const filtered = prev.filter(
              (a) => String(a.id ?? `${a.ts}-${a.code}-${a.field}`) !== key
            );
            return [record, ...filtered].slice(0, 200);
          });
        },
        onVarianceChange: (record, event) => {
          if (event === 'DELETE') {
            hashRef.current.variances.delete(record.id);
            settersRef.current.setVariances((prev) => prev.filter((v) => v.id !== record.id));
            return;
          }
          const hash = JSON.stringify(record);
          if (hashRef.current.variances.get(record.id) === hash) return;
          hashRef.current.variances.set(record.id, hash);
          settersRef.current.setVariances((prev) => {
            const filtered = prev.filter((v) => v.id !== record.id);
            return [record, ...filtered];
          });
        },
        onSaleLineChange: (record, event) => {
          if (event === 'DELETE') {
            hashRef.current.saleLines.delete(record.id);
            settersRef.current.setSaleLines((prev) => prev.filter((l) => l.id !== record.id));
            return;
          }
          const hash = JSON.stringify(record);
          if (hashRef.current.saleLines.get(record.id) === hash) return;
          hashRef.current.saleLines.set(record.id, hash);
          settersRef.current.setSaleLines((prev) => {
            const filtered = prev.filter((l) => l.id !== record.id);
            return [record, ...filtered];
          });
        },
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [authReady]);

  // ---- Push local changes (debounced) ----
  useEffect(() => {
    // gate on status.ready (state) so this effect re-runs after loadRemoteSnapshot resolves
    // and seeds the server with whatever was in local state at mount time.
    if (!status.ready) return;
    const h = hashRef.current;

    // --- items ---
    const changedItems: StockItem[] = [];
    const seenCodes = new Set<string>();
    for (const it of state.items) {
      seenCodes.add(it.code);
      const hash = JSON.stringify(it);
      if (h.items.get(it.code) !== hash) {
        changedItems.push(it);
        h.items.set(it.code, hash);
      }
    }
    const removedCodes: string[] = [];
    for (const code of Array.from(h.items.keys())) {
      if (!seenCodes.has(code)) {
        removedCodes.push(code);
        h.items.delete(code);
      }
    }

    // --- shift ---
    const shiftHash = JSON.stringify(state.shift);
    const shiftChanged = h.shift !== shiftHash;
    if (shiftChanged) h.shift = shiftHash;

    // --- daily ---
    const changedDaily: DailyRecord[] = [];
    for (const d of state.daily) {
      const hash = JSON.stringify(d);
      if (h.daily.get(d.date) !== hash) {
        changedDaily.push(d);
        h.daily.set(d.date, hash);
      }
    }

    // --- receipts ---
    const changedReceipts: ReceiptRecord[] = [];
    for (const r of state.receipts) {
      const hash = JSON.stringify(r);
      if (h.receipts.get(r.id) !== hash) {
        changedReceipts.push(r);
        h.receipts.set(r.id, hash);
      }
    }

    // --- audit (keep only new entries, we don't edit past entries) ---
    const changedAudit: AuditRecord[] = [];
    for (const a of state.audit) {
      const key = String(a.id ?? `${a.ts}-${a.code}-${a.field}`);
      const hash = JSON.stringify(a);
      if (h.audit.get(key) !== hash) {
        changedAudit.push(a);
        h.audit.set(key, hash);
      }
    }

    // --- variances ---
    const changedVariances: VarianceRecord[] = [];
    for (const v of state.variances) {
      const hash = JSON.stringify(v);
      if (h.variances.get(v.id) !== hash) {
        changedVariances.push(v);
        h.variances.set(v.id, hash);
      }
    }

    // --- sale lines ---
    const changedSaleLines: SaleLine[] = [];
    const seenLineIds = new Set<string>();
    for (const l of state.saleLines) {
      seenLineIds.add(l.id);
      const hash = JSON.stringify(l);
      if (h.saleLines.get(l.id) !== hash) {
        changedSaleLines.push(l);
        h.saleLines.set(l.id, hash);
      }
    }

    const handle = window.setTimeout(() => {
      Promise.all([
        pushStockItems(changedItems),
        removedCodes.length ? deleteStockItems(removedCodes) : Promise.resolve(),
        shiftChanged ? pushShift(state.shift) : Promise.resolve(),
        pushDaily(changedDaily),
        pushReceipts(changedReceipts),
        pushAudit(changedAudit),
        pushVariances(changedVariances),
        pushSaleLines(changedSaleLines),
      ]).catch((err) => {
        setStatus((s) => ({ ...s, lastError: String(err) }));
      });
    }, 300);

    return () => window.clearTimeout(handle);
  }, [
    status.ready,
    state.items,
    state.shift,
    state.daily,
    state.receipts,
    state.audit,
    state.variances,
    state.saleLines,
  ]);

  return status;
}
