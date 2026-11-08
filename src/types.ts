export type TabId = 'stock' | 'receive' | 'cash' | 'report' | 'set';

export interface MatchPrevState {
  actual: number;
  counted: boolean;
}

export interface StockItem {
  code: string;
  name: string;
  nameEn?: string;
  cat: string;
  catEn?: string;
  carry: number;
  actual: number;
  out: number;
  sold: number;
  broken: number;
  recv: number;
  counted?: boolean;
  deleted?: boolean;
  sample?: boolean;
  kind?: 'snack' | 'material';
  unit?: string;
  price?: number;
  cost?: number;
  spec?: string;
  matchPrev?: MatchPrevState | null;
  wasteBreakdown?: Record<string, number>;
  _cat?: string;
}

export interface ExpenseItem {
  id: string;
  label: string;
  amt: number;
}

export interface ShiftData {
  id?: string;
  date: string;
  branch: string;
  cash: number;
  qr: number;
  pos: number | null;
  float: number;
  floatEnd?: number | null;
  locked: boolean;
  expenses: ExpenseItem[];
  counterName?: string | null;
  counterTitle?: string | null;
  targetSales?: number | null;
  targetCustomers?: number | null;
  targetPerBill?: number | null;
}

export interface DailyRecord {
  date: string;
  closed: boolean;
  sold: number;
  gross: number;
  cash: number;
  qr: number;
  exp: number;
  remit: number;
  broken: number;
  lossVal?: number;
  cats: Record<string, number>;
  nets: Record<string, number>;
  sys?: Record<string, number> | null;
  posOk?: boolean;
  by?: string;
  sample?: boolean;
  counterName?: string | null;
  counterTitle?: string | null;
  targetSales?: number | null;
  targetCustomers?: number | null;
  targetPerBill?: number | null;
}

export interface ReceiptLine {
  code?: string;
  name: string;
  doc: number;
  act: number;
}

export interface ReceiptRecord {
  id: string;
  date: string;
  ts: number;
  src?: 'photo' | 'sheet' | 'manual';
  fileName?: string | null;
  photo?: string | null;
  lines: ReceiptLine[];
}

export interface AuditRecord {
  id?: number | string;
  ts: number;
  by: string;
  code: string;
  field: string;
  from: string | number | boolean;
  to: string | number | boolean;
  why?: string;
}

export interface VarianceRecord {
  id: string;
  date: string;
  code: string;
  name: string;
  carry: number;
  actual: number;
  diff: number;
  value: number;
  status: 'pending' | 'resolved';
  note: string;
  resolvedBy?: string;
  resolvedAt?: number;
  ts: number;
}

export interface SaleType {
  id: string;
  label: string;
  rule: 'full' | 'pct' | 'fixed';
  value: number;
  sort: number;
  hidden?: boolean;
}

export interface SaleLine {
  id: string;
  date: string;
  code: string;
  typeId: string;
  qty: number;
  unitPrice: number;
  unitCost: number | null;
  amount: number;
  ts: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  status: 'approved' | 'pending' | 'rejected';
  must_change_password?: boolean;
}
