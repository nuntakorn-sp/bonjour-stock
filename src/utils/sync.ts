import type { RealtimeChannel } from '@supabase/supabase-js';
import { sb } from './supabase';
import type {
  StockItem,
  ShiftData,
  DailyRecord,
  ReceiptRecord,
  AuditRecord,
  VarianceRecord,
  SaleLine,
} from '../types';

// ===== Row <-> TS mappers =====

type StockRow = {
  code: string;
  name: string | null;
  name_en: string | null;
  cat: string | null;
  cat_en: string | null;
  kind: string | null;
  unit: string | null;
  price: number | null;
  cost: number | null;
  spec: string | null;
  carry: number | null;
  actual: number | null;
  out_qty: number | null;
  sold: number | null;
  broken: number | null;
  recv: number | null;
  counted: boolean | null;
  deleted: boolean | null;
  sample: boolean | null;
  match_prev: StockItem['matchPrev'] | null;
  waste_breakdown: Record<string, number> | null;
};

const stockFromRow = (r: StockRow): StockItem => ({
  code: r.code,
  name: r.name || '',
  nameEn: r.name_en || undefined,
  cat: r.cat || '',
  catEn: r.cat_en || undefined,
  kind: (r.kind as StockItem['kind']) || undefined,
  unit: r.unit || undefined,
  price: r.price ?? undefined,
  cost: r.cost ?? undefined,
  spec: r.spec || undefined,
  carry: Number(r.carry ?? 0),
  actual: Number(r.actual ?? 0),
  out: Number(r.out_qty ?? 0),
  sold: Number(r.sold ?? 0),
  broken: Number(r.broken ?? 0),
  recv: Number(r.recv ?? 0),
  counted: r.counted ?? undefined,
  deleted: r.deleted ?? undefined,
  sample: r.sample ?? undefined,
  matchPrev: r.match_prev ?? null,
  wasteBreakdown: r.waste_breakdown ?? undefined,
});

const stockToRow = (it: StockItem): StockRow => ({
  code: it.code,
  name: it.name ?? null,
  name_en: it.nameEn ?? null,
  cat: it.cat ?? null,
  cat_en: it.catEn ?? null,
  kind: it.kind ?? null,
  unit: it.unit ?? null,
  price: it.price ?? null,
  cost: it.cost ?? null,
  spec: it.spec ?? null,
  carry: it.carry ?? 0,
  actual: it.actual ?? 0,
  out_qty: it.out ?? 0,
  sold: it.sold ?? 0,
  broken: it.broken ?? 0,
  recv: it.recv ?? 0,
  counted: it.counted ?? false,
  deleted: it.deleted ?? false,
  sample: it.sample ?? false,
  match_prev: it.matchPrev ?? null,
  waste_breakdown: it.wasteBreakdown ?? null,
});

type ShiftRow = {
  branch: string;
  date: string;
  cash: number | null;
  qr: number | null;
  pos: number | null;
  float_amt: number | null;
  float_end: number | null;
  locked: boolean | null;
  expenses: ShiftData['expenses'];
  counter_name: string | null;
  counter_title: string | null;
  target_sales: number | null;
  target_customers: number | null;
  target_per_bill: number | null;
};

const shiftFromRow = (r: ShiftRow): ShiftData => ({
  date: r.date,
  branch: r.branch,
  cash: Number(r.cash ?? 0),
  qr: Number(r.qr ?? 0),
  pos: r.pos ?? null,
  float: Number(r.float_amt ?? 0),
  floatEnd: r.float_end,
  locked: r.locked ?? false,
  expenses: Array.isArray(r.expenses) ? r.expenses : [],
  counterName: r.counter_name,
  counterTitle: r.counter_title,
  targetSales: r.target_sales,
  targetCustomers: r.target_customers,
  targetPerBill: r.target_per_bill,
});

const shiftToRow = (s: ShiftData): ShiftRow => ({
  branch: s.branch,
  date: s.date,
  cash: s.cash ?? 0,
  qr: s.qr ?? 0,
  pos: s.pos ?? null,
  float_amt: s.float ?? 0,
  float_end: s.floatEnd ?? null,
  locked: Boolean(s.locked),
  expenses: s.expenses ?? [],
  counter_name: s.counterName ?? null,
  counter_title: s.counterTitle ?? null,
  target_sales: s.targetSales ?? null,
  target_customers: s.targetCustomers ?? null,
  target_per_bill: s.targetPerBill ?? null,
});

type DailyRow = {
  date: string;
  closed: boolean | null;
  sold: number | null;
  gross: number | null;
  cash: number | null;
  qr: number | null;
  exp: number | null;
  remit: number | null;
  broken: number | null;
  loss_val: number | null;
  cats: Record<string, number> | null;
  nets: Record<string, number> | null;
  sys: Record<string, number> | null;
  pos_ok: boolean | null;
  by_user: string | null;
  sample: boolean | null;
  counter_name: string | null;
  counter_title: string | null;
  target_sales: number | null;
  target_customers: number | null;
  target_per_bill: number | null;
};

const dailyFromRow = (r: DailyRow): DailyRecord => ({
  date: r.date,
  closed: r.closed ?? false,
  sold: Number(r.sold ?? 0),
  gross: Number(r.gross ?? 0),
  cash: Number(r.cash ?? 0),
  qr: Number(r.qr ?? 0),
  exp: Number(r.exp ?? 0),
  remit: Number(r.remit ?? 0),
  broken: Number(r.broken ?? 0),
  lossVal: r.loss_val ?? undefined,
  cats: r.cats ?? {},
  nets: r.nets ?? {},
  sys: r.sys ?? null,
  posOk: r.pos_ok ?? undefined,
  by: r.by_user ?? undefined,
  sample: r.sample ?? undefined,
  counterName: r.counter_name,
  counterTitle: r.counter_title,
  targetSales: r.target_sales,
  targetCustomers: r.target_customers,
  targetPerBill: r.target_per_bill,
});

const dailyToRow = (d: DailyRecord): DailyRow => ({
  date: d.date,
  closed: d.closed,
  sold: d.sold,
  gross: d.gross,
  cash: d.cash,
  qr: d.qr,
  exp: d.exp,
  remit: d.remit,
  broken: d.broken,
  loss_val: d.lossVal ?? null,
  cats: d.cats ?? {},
  nets: d.nets ?? {},
  sys: d.sys ?? null,
  pos_ok: d.posOk ?? null,
  by_user: d.by ?? null,
  sample: d.sample ?? null,
  counter_name: d.counterName ?? null,
  counter_title: d.counterTitle ?? null,
  target_sales: d.targetSales ?? null,
  target_customers: d.targetCustomers ?? null,
  target_per_bill: d.targetPerBill ?? null,
});

type ReceiptRow = {
  id: string;
  date: string;
  ts: number;
  src: string | null;
  file_name: string | null;
  photo: string | null;
  lines: ReceiptRecord['lines'];
};

const receiptFromRow = (r: ReceiptRow): ReceiptRecord => ({
  id: r.id,
  date: r.date,
  ts: Number(r.ts),
  src: (r.src as ReceiptRecord['src']) || undefined,
  fileName: r.file_name,
  photo: r.photo,
  lines: Array.isArray(r.lines) ? r.lines : [],
});

const receiptToRow = (rec: ReceiptRecord): ReceiptRow => ({
  id: rec.id,
  date: rec.date,
  ts: rec.ts,
  src: rec.src ?? null,
  file_name: rec.fileName ?? null,
  photo: rec.photo ?? null,
  lines: rec.lines ?? [],
});

type AuditRow = {
  id: string;
  ts: number;
  by_user: string;
  code: string;
  field: string;
  from_val: string;
  to_val: string;
  why: string | null;
};

const auditFromRow = (r: AuditRow): AuditRecord => ({
  id: r.id,
  ts: Number(r.ts),
  by: r.by_user,
  code: r.code,
  field: r.field,
  from: r.from_val,
  to: r.to_val,
  why: r.why ?? undefined,
});

const auditToRow = (a: AuditRecord): AuditRow => ({
  id: String(a.id ?? `${a.ts}-${a.code}-${a.field}`),
  ts: a.ts,
  by_user: a.by,
  code: a.code,
  field: a.field,
  from_val: String(a.from),
  to_val: String(a.to),
  why: a.why ?? null,
});

type VarianceRow = {
  id: string;
  date: string;
  code: string;
  name: string;
  carry: number;
  actual: number;
  diff: number;
  value: number;
  status: string;
  note: string | null;
  resolved_by: string | null;
  resolved_at: number | null;
  ts: number;
};

const varianceFromRow = (r: VarianceRow): VarianceRecord => ({
  id: r.id,
  date: r.date,
  code: r.code,
  name: r.name,
  carry: Number(r.carry),
  actual: Number(r.actual),
  diff: Number(r.diff),
  value: Number(r.value),
  status: (r.status as VarianceRecord['status']) || 'pending',
  note: r.note ?? '',
  resolvedBy: r.resolved_by ?? undefined,
  resolvedAt: r.resolved_at ?? undefined,
  ts: Number(r.ts),
});

const varianceToRow = (v: VarianceRecord): VarianceRow => ({
  id: v.id,
  date: v.date,
  code: v.code,
  name: v.name,
  carry: v.carry,
  actual: v.actual,
  diff: v.diff,
  value: v.value,
  status: v.status,
  note: v.note ?? null,
  resolved_by: v.resolvedBy ?? null,
  resolved_at: v.resolvedAt ?? null,
  ts: v.ts,
});

type SaleLineRow = {
  id: string;
  date: string;
  code: string;
  type_id: string;
  qty: number;
  unit_price: number;
  unit_cost: number | null;
  amount: number;
  ts: number;
};

const saleLineFromRow = (r: SaleLineRow): SaleLine => ({
  id: r.id,
  date: r.date,
  code: r.code,
  typeId: r.type_id,
  qty: Number(r.qty),
  unitPrice: Number(r.unit_price),
  unitCost: r.unit_cost == null ? null : Number(r.unit_cost),
  amount: Number(r.amount),
  ts: Number(r.ts),
});

const saleLineToRow = (l: SaleLine): SaleLineRow => ({
  id: l.id,
  date: l.date,
  code: l.code,
  type_id: l.typeId,
  qty: l.qty,
  unit_price: l.unitPrice,
  unit_cost: l.unitCost,
  amount: l.amount,
  ts: l.ts,
});

// ===== LOAD =====

export interface RemoteSnapshot {
  items: StockItem[];
  shift: ShiftData | null;
  daily: DailyRecord[];
  receipts: ReceiptRecord[];
  audit: AuditRecord[];
  variances: VarianceRecord[];
  saleLines: SaleLine[];
}

export async function loadRemoteSnapshot(branch: string): Promise<RemoteSnapshot | null> {
  try {
    const [items, shift, daily, receipts, audit, variances, saleLines] = await Promise.all([
      sb.from('stock_items').select('*'),
      sb.from('current_shift').select('*').eq('branch', branch).maybeSingle(),
      sb.from('daily_records').select('*').order('date', { ascending: false }),
      sb.from('receipts').select('*').order('ts', { ascending: false }),
      sb.from('audit_log').select('*').order('ts', { ascending: false }).limit(200),
      sb.from('variances').select('*').order('ts', { ascending: false }),
      sb.from('sale_lines').select('*').order('ts', { ascending: false }),
    ]);

    if (items.error) throw items.error;

    return {
      items: (items.data || []).map((r) => stockFromRow(r as StockRow)),
      shift: shift.data ? shiftFromRow(shift.data as ShiftRow) : null,
      daily: (daily.data || []).map((r) => dailyFromRow(r as DailyRow)),
      receipts: (receipts.data || []).map((r) => receiptFromRow(r as ReceiptRow)),
      audit: (audit.data || []).map((r) => auditFromRow(r as AuditRow)),
      variances: (variances.data || []).map((r) => varianceFromRow(r as VarianceRow)),
      saleLines: (saleLines.data || []).map((r) => saleLineFromRow(r as SaleLineRow)),
    };
  } catch (err) {
    console.warn('[sync] loadRemoteSnapshot failed', err);
    return null;
  }
}

// ===== PUSH (upsert / insert / delete) =====

export async function pushStockItems(items: StockItem[]): Promise<void> {
  if (!items.length) return;
  const { error } = await sb.from('stock_items').upsert(items.map(stockToRow));
  if (error) console.warn('[sync] pushStockItems', error);
}

export async function deleteStockItems(codes: string[]): Promise<void> {
  if (!codes.length) return;
  const { error } = await sb.from('stock_items').delete().in('code', codes);
  if (error) console.warn('[sync] deleteStockItems', error);
}

export async function pushShift(shift: ShiftData): Promise<void> {
  const { error } = await sb.from('current_shift').upsert(shiftToRow(shift));
  if (error) console.warn('[sync] pushShift', error);
}

export async function pushDaily(records: DailyRecord[]): Promise<void> {
  if (!records.length) return;
  const { error } = await sb.from('daily_records').upsert(records.map(dailyToRow));
  if (error) console.warn('[sync] pushDaily', error);
}

export async function pushReceipts(records: ReceiptRecord[]): Promise<void> {
  if (!records.length) return;
  const { error } = await sb.from('receipts').upsert(records.map(receiptToRow));
  if (error) console.warn('[sync] pushReceipts', error);
}

export async function pushAudit(records: AuditRecord[]): Promise<void> {
  if (!records.length) return;
  const { error } = await sb.from('audit_log').upsert(records.map(auditToRow));
  if (error) console.warn('[sync] pushAudit', error);
}

export async function pushVariances(records: VarianceRecord[]): Promise<void> {
  if (!records.length) return;
  const { error } = await sb.from('variances').upsert(records.map(varianceToRow));
  if (error) console.warn('[sync] pushVariances', error);
}

export async function pushSaleLines(records: SaleLine[]): Promise<void> {
  if (!records.length) return;
  const { error } = await sb.from('sale_lines').upsert(records.map(saleLineToRow));
  if (error) console.warn('[sync] pushSaleLines', error);
}

export async function deleteSaleLinesWhere(date: string, code: string): Promise<void> {
  const { error } = await sb.from('sale_lines').delete().match({ date, code });
  if (error) console.warn('[sync] deleteSaleLinesWhere', error);
}

// ===== REALTIME =====

export interface RealtimeHandlers {
  onStockChange: (item: StockItem, event: 'INSERT' | 'UPDATE' | 'DELETE', code: string) => void;
  onShiftChange: (shift: ShiftData) => void;
  onDailyChange: (record: DailyRecord, event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onReceiptChange: (record: ReceiptRecord, event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onAuditChange: (record: AuditRecord, event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onVarianceChange: (record: VarianceRecord, event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onSaleLineChange: (record: SaleLine, event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
}

export function subscribeAll(branch: string, handlers: RealtimeHandlers): () => void {
  const channel: RealtimeChannel = sb
    .channel('bonjour-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stock_items' },
      (payload) => {
        const row = (payload.new || payload.old) as StockRow;
        if (!row?.code) return;
        const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const item = event === 'DELETE' ? ({} as StockItem) : stockFromRow(row);
        handlers.onStockChange(item, event, row.code);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'current_shift', filter: `branch=eq.${branch}` },
      (payload) => {
        const row = (payload.new || payload.old) as ShiftRow;
        if (row?.branch) handlers.onShiftChange(shiftFromRow(row));
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'daily_records' },
      (payload) => {
        const row = (payload.new || payload.old) as DailyRow;
        if (row?.date)
          handlers.onDailyChange(
            dailyFromRow(row),
            payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          );
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'receipts' },
      (payload) => {
        const row = (payload.new || payload.old) as ReceiptRow;
        if (row?.id)
          handlers.onReceiptChange(
            receiptFromRow(row),
            payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          );
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'audit_log' },
      (payload) => {
        const row = (payload.new || payload.old) as AuditRow;
        if (row?.id)
          handlers.onAuditChange(
            auditFromRow(row),
            payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          );
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'variances' },
      (payload) => {
        const row = (payload.new || payload.old) as VarianceRow;
        if (row?.id)
          handlers.onVarianceChange(
            varianceFromRow(row),
            payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          );
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sale_lines' },
      (payload) => {
        const row = (payload.new || payload.old) as SaleLineRow;
        if (row?.id)
          handlers.onSaleLineChange(
            saleLineFromRow(row),
            payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          );
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
