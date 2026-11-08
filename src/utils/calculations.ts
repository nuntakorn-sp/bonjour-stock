import { StockItem, SaleType, ShiftData, SaleLine, DailyRecord, VarianceRecord, ReceiptLine } from '../types';

export const N = (v: unknown): number => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);

export const fmt = (v: unknown): string => N(v).toLocaleString('th-TH');

export const baht = (v: unknown): string =>
  '฿' +
  N(v).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const isC = (o: Pick<StockItem, 'counted'>): boolean => o.counted !== false;

export interface ItemCalcResult {
  open: number;
  net: number;
  diff: number;
}

export function calc(o: Pick<StockItem, 'actual' | 'out' | 'sold' | 'broken' | 'carry'>): ItemCalcResult {
  const open = N(o.actual) - N(o.out);
  const net = open - N(o.sold) - N(o.broken);
  const diff = N(o.actual) - N(o.carry);
  return { open, net, diff };
}

export function unitPriceFor(o: Pick<StockItem, 'price'>, t?: Pick<SaleType, 'rule' | 'value'> | null): number {
  const p = N(o.price);
  if (!t || t.rule === 'full') return p;
  if (t.rule === 'pct') return Math.max(0, p * (1 - N(t.value) / 100));
  if (t.rule === 'fixed') return N(t.value);
  return 0;
}

export function shiftDay(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addDay(s: string): string {
  return shiftDay(s, 1);
}

export function nextCode(allCodes: string[], extra: string[] = []): string {
  const all = [...allCodes.map(String), ...extra];
  let best: { p: string; n: string } | null = null;
  all.forEach((c) => {
    const m = c.match(/^(.*?)(\d+)$/);
    if (m && (!best || +m[2] > +best.n)) {
      best = { p: m[1], n: m[2] };
    }
  });
  const p = best ? (best as { p: string; n: string }).p : 'P';
  const w = best ? (best as { p: string; n: string }).n.length : 3;
  let n = best ? +(best as { p: string; n: string }).n + 1 : 1;
  let code = '';
  do {
    code = p + String(n).padStart(w, '0');
    n++;
  } while (all.includes(code));
  return code;
}

export function nextCodeForKind(
  items: Pick<StockItem, 'code' | 'kind'>[],
  kind: 'snack' | 'material',
  extra: string[] = []
): string {
  if (kind === 'material') {
    const matCodes = items
      .map((o) => String(o.code))
      .filter((c) => /^M\d+$/i.test(c));
    return nextCode(matCodes.length ? matCodes : ['M00'], extra);
  }
  const snackCodes = items
    .filter((o) => o.kind !== 'material' && !/^M\d+$/i.test(String(o.code)))
    .map((o) => String(o.code));
  return nextCode(snackCodes.length ? snackCodes : ['1000'], extra);
}

export function normalizeStockItems(rawItems: StockItem[]): StockItem[] {
  const legacyMaterialCodeMap: Record<string, string> = {
    '84008': 'M06',
    '84009': 'M14',
    '84012': 'M15',
    '84010': 'M26',
  };
  const replacedTargetCodes = new Set(
    rawItems
      .filter((o) => !o.deleted && o.kind === 'material' && legacyMaterialCodeMap[String(o.code)])
      .map((o) => legacyMaterialCodeMap[String(o.code)])
  );

  const filtered = rawItems.filter(
    (o) => !(o.deleted && o.kind === 'material' && replacedTargetCodes.has(String(o.code)))
  );

  const usedCodes = new Set(filtered.map((o) => legacyMaterialCodeMap[String(o.code)] || String(o.code)));

  return filtered.map((item) => {
    let code = String(item.code);
    let name = item.name;
    let nameEn = item.nameEn;

    if (name === 'กระเป๋าฟ้า' || name === 'กระเป๋ษผ้า') {
      name = 'กระเป๋าผ้า';
      if (!nameEn || nameEn === 'Blue Bag') nameEn = 'Cloth Bag';
    } else if (name === 'ถุงขนมชู') {
      name = 'ถุงบองชู';
      if (!nameEn || nameEn === 'Choux Bags') nameEn = 'Bonjour Bags';
    } else if (name === 'อูกเกต') {
      name = 'ลูกเกต';
      if (!nameEn || nameEn === 'Ugget') nameEn = 'Raisins';
    }

    if (item.kind === 'material') {
      if (legacyMaterialCodeMap[code]) {
        code = legacyMaterialCodeMap[code];
      } else if (!/^M\d+$/i.test(code)) {
        const mCodes = Array.from(usedCodes).filter((c) => /^M\d+$/i.test(c));
        code = nextCode(mCodes.length ? mCodes : ['M00']);
        usedCodes.add(code);
      }
    }

    return {
      ...item,
      code,
      name,
      nameEn,
    };
  });
}

export function calculateCashSummary(shift: ShiftData, saleLines: SaleLine[]) {
  const exp = (shift.expenses || []).reduce((a, e) => a + N(e.amt), 0);
  const gross = N(shift.cash) + N(shift.qr);
  const remit = N(shift.cash) - exp;
  const sysSales = (saleLines || [])
    .filter((l) => l.date === shift.date)
    .reduce((a, l) => a + N(l.amount), 0);
  const dif = Math.round((gross - sysSales) * 100) / 100;
  const posMatches = shift.pos !== null && shift.pos !== undefined && N(shift.pos) === gross;
  const floatEnd =
    shift.floatEnd !== undefined && shift.floatEnd !== null ? N(shift.floatEnd) : N(shift.float);
  const floatDiff = Math.round((floatEnd - N(shift.float)) * 100) / 100;
  return {
    exp,
    gross,
    remit,
    sysSales,
    dif,
    posMatches,
    floatEnd,
    floatDiff,
  };
}

export function computeNextShiftItem(it: StockItem): StockItem {
  if (it.deleted) return it;
  const c = calc(it);
  const rawNet = c.net;
  const rawSys = N(it.carry) - N(it.out) - N(it.sold) - N(it.broken);
  let nextCarry: number;
  let nextActual: number;

  if (c.diff < 0) {
    nextActual = Math.max(0, rawNet);
    nextCarry = nextActual - c.diff;
  } else if (c.diff > 0) {
    nextCarry = Math.max(0, rawSys);
    nextActual = nextCarry + c.diff;
  } else {
    nextActual = Math.max(0, rawNet);
    nextCarry = nextActual;
  }

  return {
    ...it,
    carry: nextCarry,
    actual: nextActual,
    out: 0,
    sold: 0,
    broken: 0,
    recv: 0,
    counted: false,
    matchPrev: null,
    wasteBreakdown: {},
  };
}

export function buildShiftVariances(
  shiftDate: string,
  liveItems: StockItem[],
  existingVariances: VarianceRecord[],
  nowTs = Date.now()
): VarianceRecord[] {
  const newRecords: VarianceRecord[] = liveItems
    .map((o) => ({ ...o, ...calc(o) }))
    .filter((o) => o.diff !== 0)
    .map((o) => ({
      id: `${shiftDate}-${o.code}`,
      date: shiftDate,
      code: o.code,
      name: o.name,
      carry: N(o.carry),
      actual: N(o.actual),
      diff: o.diff,
      value: -o.diff * N(o.cost),
      status: 'pending' as const,
      note: '',
      ts: nowTs,
    }));

  if (!newRecords.length) return existingVariances;
  const newIds = new Set(newRecords.map((r) => r.id));
  return [...newRecords, ...(existingVariances || []).filter((v) => !newIds.has(v.id))];
}

export function calculateFinanceMetrics(params: {
  anchorDate: string;
  spanDays: number;
  shiftDate: string;
  liveItems: StockItem[];
  saleLines: SaleLine[];
  dailyRecords: DailyRecord[];
  variances: VarianceRecord[];
}) {
  const { anchorDate: a, spanDays: n, shiftDate, liveItems, saleLines, dailyRecords, variances } = params;
  const lv = a >= shiftDate;
  const days: string[] = [];
  for (let i = 0; i < n; i++) days.push(shiftDay(a, -i));
  const inW = (d: string) => days.includes(d);
  const lines = (saleLines || []).filter((l) => inW(l.date));
  let rev = 0;
  let cogs = 0;
  let noCost = 0;
  lines.forEach((l) => {
    rev += N(l.amount);
    if (l.unitCost == null || N(l.unitCost) === 0) noCost++;
    cogs += N(l.qty) * N(l.unitCost);
  });
  let conf = 0;
  let exp = 0;
  if (lv) {
    liveItems
      .filter((o) => o.kind !== 'material')
      .forEach((o) => {
        conf += N(o.broken) * N(o.cost);
        const dd = calc(o).diff;
        if (dd < 0) exp += -dd * N(o.cost);
      });
  }
  (dailyRecords || [])
    .filter((d) => inW(d.date))
    .forEach((d) => {
      conf += N(d.lossVal);
    });
  (variances || [])
    .filter((v) => inW(v.date))
    .forEach((v) => {
      const x = Math.max(0, N(v.value));
      if (v.status === 'resolved') conf += x;
      else if (!lv) exp += x;
    });
  const profit = rev - cogs - conf;
  const pos = Math.max(0, profit);
  const tot = pos + exp;
  const gp = tot ? (pos / tot) * 100 : 0;
  return {
    a,
    n,
    days,
    lines,
    rev,
    cogs,
    noCost,
    conf,
    exp,
    profit,
    gp,
    none: !lines.length && !conf && !exp,
  };
}

export function normalizeMatchKey(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/สตรอเบอรี่|สตอเบอรี่|สตอเบอร์รี่|สตรอเบอร์รี่/g, 'สตรอว์เบอร์รี')
    .replace(/ช็อคโกแลต|ช็อกโกแล็ต|ช็อคโกแล็ต/g, 'ช็อกโกแลต')
    .replace(/ช็อค/g, 'ช็อก')
    .replace(/ชิพ/g, 'ชิป')
    .replace(/ครัวซองค์|ครัวซอง(?!ต์)/g, 'ครัวซองต์')
    .replace(/อัลมอน(?!ด์)/g, 'อัลมอนด์')
    .replace(/ลูกเกด|อูกเกต/g, 'ลูกเกต')
    .replace(/บองชูร์|ขนมชู/g, 'บองชู')
    .replace(/กระเป๋าฟ้า|กระเป๋ษผ้า/g, 'กระเป๋าผ้า')
    .replace(/[\s\-_.,()[\]{}'"/\\·•:;#]+/g, '');
}

export function matchCatalogItem(
  items: StockItem[],
  rawCode?: string | null,
  rawName?: string | null
): StockItem | undefined {
  const active = items.filter((z) => !z.deleted);
  if (!active.length) return undefined;

  const cleanCode = String(rawCode || '')
    .trim()
    .replace(/^[#รหัส\s:]+/i, '')
    .trim();

  if (cleanCode) {
    const exactByCode = active.find(
      (z) => String(z.code).toLowerCase() === cleanCode.toLowerCase()
    );
    if (exactByCode) return exactByCode;

    const mPad = cleanCode.match(/^m0*(\d+)$/i);
    if (mPad) {
      const padded = 'm' + mPad[1].padStart(2, '0');
      const byMPad = active.find((z) => String(z.code).toLowerCase() === padded);
      if (byMPad) return byMPad;
    }
  }

  const nameStr = String(rawName || '').trim();
  if (!nameStr) return undefined;

  // Check if name itself is an exact code
  const directCode = active.find(
    (z) => String(z.code).toLowerCase() === nameStr.toLowerCase()
  );
  if (directCode) return directCode;

  // Check if name starts with or embeds a bracketed/prefixed catalog code e.g. "[1052] แลตติซ..." or "1052 แลตติซ..."
  const codeTokens = nameStr.match(/\b(M\d{1,3}|\d{4,5})\b/gi) || [];
  for (const tok of codeTokens) {
    const byTok = active.find((z) => String(z.code).toLowerCase() === tok.toLowerCase());
    if (byTok) return byTok;
    const mTok = tok.match(/^m0*(\d+)$/i);
    if (mTok) {
      const padded = 'm' + mTok[1].padStart(2, '0');
      const byMPad = active.find((z) => String(z.code).toLowerCase() === padded);
      if (byMPad) return byMPad;
    }
  }

  // Strip leading/trailing code prefix if any before matching names
  const strippedName = nameStr
    .replace(/^\[?\s*(?:รหัส\s*)?(?:M\d{1,3}|\d{4,5})\s*\]?[\s\-:·•]*/i, '')
    .trim();

  const lowerRaw = nameStr.toLowerCase();
  const lowerStripped = strippedName.toLowerCase();

  const exactByName = active.find(
    (z) =>
      String(z.name).trim().toLowerCase() === lowerRaw ||
      String(z.name).trim().toLowerCase() === lowerStripped ||
      (z.nameEn &&
        (String(z.nameEn).trim().toLowerCase() === lowerRaw ||
          String(z.nameEn).trim().toLowerCase() === lowerStripped))
  );
  if (exactByName) return exactByName;

  const normTarget = normalizeMatchKey(strippedName || nameStr);
  if (!normTarget) return undefined;

  const normMatch = active.find(
    (z) =>
      normalizeMatchKey(z.name) === normTarget ||
      (z.nameEn && normalizeMatchKey(z.nameEn) === normTarget)
  );
  if (normMatch) return normMatch;

  // Partial / containment match (pick closest length match so specific names win)
  if (normTarget.length >= 3) {
    const candidates = active
      .map((z) => {
        const nk = normalizeMatchKey(z.name);
        const ek = z.nameEn ? normalizeMatchKey(z.nameEn) : '';
        let score = 0;
        if (nk && (nk.includes(normTarget) || normTarget.includes(nk))) {
          score = Math.min(nk.length, normTarget.length) / Math.max(nk.length, normTarget.length);
        }
        if (ek && (ek.includes(normTarget) || normTarget.includes(ek))) {
          const eScore =
            Math.min(ek.length, normTarget.length) / Math.max(ek.length, normTarget.length);
          if (eScore > score) score = eScore;
        }
        return { item: z, score };
      })
      .filter((c) => c.score >= 0.55)
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      return candidates[0].item;
    }
  }

  return undefined;
}

export function reconcileExtractedLinesWithCatalog(
  rawLines: Array<{
    matchedCode?: string;
    code?: string;
    name: string;
    doc?: number;
    act?: number;
  }>,
  catalog: StockItem[]
): ReceiptLine[] {
  const mergedMap = new Map<string, ReceiptLine>();

  for (const r of rawLines) {
    const rawName = String(r.name || '').trim();
    const rawCode = String(r.matchedCode || r.code || '').trim();
    if (!rawName && !rawCode) continue;

    const matched = matchCatalogItem(catalog, rawCode, rawName);
    const actVal = Math.max(0, N(r.act !== undefined ? r.act : r.doc));
    const docVal = Math.max(0, N(r.doc !== undefined && N(r.doc) > 0 ? r.doc : actVal));

    if (actVal === 0 && docVal === 0) continue;

    const finalCode = matched ? matched.code : rawCode || undefined;
    const finalName = matched ? matched.name : rawName || rawCode;
    const key = matched
      ? `code:${matched.code}`
      : `name:${normalizeMatchKey(finalName) || finalName.toLowerCase()}`;

    const prev = mergedMap.get(key);
    if (prev) {
      mergedMap.set(key, {
        code: prev.code || finalCode,
        name: prev.name,
        doc: Math.round((N(prev.doc) + docVal) * 1000) / 1000,
        act: Math.round((N(prev.act) + actVal) * 1000) / 1000,
      });
    } else {
      mergedMap.set(key, {
        ...(finalCode ? { code: finalCode } : {}),
        name: finalName,
        doc: Math.round(docVal * 1000) / 1000,
        act: Math.round(actVal * 1000) / 1000,
      });
    }
  }

  return Array.from(mergedMap.values());
}

export function parseReceivingRows(rows: unknown[][], catalog: StockItem[] = []): ReceiptLine[] {
  const cleanStr = (v: unknown) => String(v ?? '').trim();
  const isNum = (v: unknown) => {
    const s = cleanStr(v).replace(/,/g, '');
    return s !== '' && !isNaN(Number(s));
  };
  const num = (v: unknown) => (isNum(v) ? Number(cleanStr(v).replace(/,/g, '')) : 0);

  const catalogCodes = new Set(
    catalog.filter((z) => !z.deleted).map((z) => String(z.code).toLowerCase())
  );
  const looksLikeCode = (v: unknown): boolean => {
    const s = cleanStr(v);
    if (!s) return false;
    if (catalogCodes.has(s.toLowerCase())) return true;
    return /^(M\d{1,3}|[12348]\d{3}|8[24]\d{3})$/i.test(s);
  };

  const kCode = /^(รหัส|รหัสสินค้า|code|id|sku|item\s*code)$/i;
  const kn = /สินค้า|รายการ|ชื่อ|ขนม|วัตถุดิบ|product|item|name|description/i;
  const kd = /ตามเอกสาร|เอกสาร|ใบสั่ง|สั่ง|doc|document|order/i;
  const ka =
    /รับจริง|จริง|ยอดยกเข้า|ยอดยกมา|ยกเข้า|ยกมา|รับเข้า|จำนวน|รวม|qty|quantity|actual|received|carry|in|count/i;

  const nonEmptyRows = rows.filter(
    (r) => Array.isArray(r) && r.some((c) => cleanStr(c) !== '')
  );
  if (!nonEmptyRows.length) return [];

  let hi = nonEmptyRows.findIndex(
    (r) =>
      r.some((c) => kn.test(cleanStr(c)) || kCode.test(cleanStr(c))) &&
      r.some((c) => kd.test(cleanStr(c)) || ka.test(cleanStr(c)))
  );

  let cols: { code: number; name: number; doc: number; act: number } = {
    code: -1,
    name: -1,
    doc: -1,
    act: -1,
  };

  if (hi >= 0) {
    const h = nonEmptyRows[hi].map((c) => cleanStr(c));
    cols.code = h.findIndex((c) => kCode.test(c));
    cols.name = h.findIndex((c, idx) => idx !== cols.code && kn.test(c));
    cols.doc = h.findIndex((c, idx) => idx !== cols.code && idx !== cols.name && kd.test(c));
    cols.act = h.findIndex(
      (c, idx) => idx !== cols.code && idx !== cols.name && idx !== cols.doc && ka.test(c)
    );
    if (cols.doc < 0 && cols.act >= 0) {
      cols.doc = cols.act;
    } else if (cols.act < 0 && cols.doc >= 0) {
      cols.act = cols.doc;
    }
  } else {
    const firstIdx = nonEmptyRows.findIndex((r) => {
      const hasQty = r.some((c) => isNum(c) && !looksLikeCode(c));
      const hasNameOrCode = r.some(
        (c) => (cleanStr(c) !== '' && !isNum(c)) || looksLikeCode(c)
      );
      return hasQty && hasNameOrCode;
    });
    if (firstIdx < 0) return [];
    hi = firstIdx - 1;
    const sampleRow = nonEmptyRows[firstIdx];
    sampleRow.forEach((c, idx) => {
      const s = cleanStr(c);
      if (!s) return;
      if (cols.code < 0 && looksLikeCode(s)) {
        cols.code = idx;
      } else if (cols.name < 0 && !isNum(s)) {
        cols.name = idx;
      }
    });
    const qtyCols = sampleRow
      .map((c, idx) => (idx !== cols.code && idx !== cols.name && isNum(c) ? idx : -1))
      .filter((idx) => idx >= 0);
    cols.doc = qtyCols[0] ?? -1;
    cols.act = qtyCols[1] ?? qtyCols[0] ?? -1;
  }

  const rawExtracted: Array<{ code?: string; name: string; doc: number; act: number }> = [];
  for (let i = hi + 1; i < nonEmptyRows.length; i++) {
    const r = nonEmptyRows[i] || [];
    const rowCode = cols.code >= 0 ? cleanStr(r[cols.code]) : '';
    const rowName = cols.name >= 0 ? cleanStr(r[cols.name]) : '';
    if (!rowName && !rowCode) continue;
    // Skip summary/total rows
    if (/^(รวม|รวมทั้งสิ้น|สรุป|total|grand\s*total|หมายเหตุ)$/i.test(rowName)) continue;

    const doc = cols.doc >= 0 ? num(r[cols.doc]) : 0;
    const act = cols.act >= 0 ? num(r[cols.act]) : doc;
    const finalDoc = doc > 0 ? doc : act;
    const finalAct = act > 0 ? act : doc;
    if (finalDoc <= 0 && finalAct <= 0) continue;

    rawExtracted.push({
      code: rowCode || undefined,
      name: rowName || rowCode,
      doc: finalDoc,
      act: finalAct,
    });
  }

  return catalog.length
    ? reconcileExtractedLinesWithCatalog(rawExtracted, catalog)
    : rawExtracted;
}

export function parseReceivingText(rawText: string, catalog: StockItem[] = []): ReceiptLine[] {
  const text = String(rawText || '').trim();
  if (!text) return [];

  // Try structured CSV/TSV rows first if multiple columns exist
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.some((l) => l.includes('\t') || l.split(',').length >= 2)) {
    const delimiter = rawLines.some((l) => l.includes('\t')) ? '\t' : ',';
    const tableRows = rawLines.map((l) => l.split(delimiter).map((c) => c.trim()));
    const parsedFromTable = parseReceivingRows(tableRows, catalog);
    if (parsedFromTable.length > 0) return parsedFromTable;
  }

  const extracted: Array<{ code?: string; name: string; doc: number; act: number }> = [];
  for (const line of rawLines) {
    // Clean bullets or numbering e.g. "1. ", "- ", "• "
    const cleaned = line
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^[-•*]\s*/, '')
      .trim();
    if (!cleaned) continue;

    // Match pattern: optional code + name + quantity (+ optional unit)
    const m = cleaned.match(
      /^(?:\[?(M\d{1,3}|\d{4,5})\]?[\s\-:·•]+)?(.+?)[\s:=×x\-·•]+(\d+(?:\.\d+)?)(?:\s+8*(\d+(?:\.\d+)?))?\s*(?:ชิ้น|กรัม|ถุง|แพ็ค|กล่อง|ขวด|แผ่น|ม้วน|pcs|g|kg|หน่วย)?$/i
    );
    if (m) {
      const code = m[1] ? m[1].trim() : undefined;
      const namePart = m[2].trim();
      const q1 = Number(m[3]);
      const q2 = m[4] !== undefined ? Number(m[4]) : q1;
      if (Number.isFinite(q1) && (q1 > 0 || q2 > 0)) {
        extracted.push({
          code,
          name: namePart,
          doc: q1,
          act: q2,
        });
        continue;
      }
    }

    // Also support "<Code> <Qty>" when code is in catalog
    const codeOnlyMatch = cleaned.match(/^(M\d{1,3}|\d{4,5})[\s:=×x\-]+(\d+(?:\.\d+)?)$/i);
    if (codeOnlyMatch) {
      const code = codeOnlyMatch[1];
      const qty = Number(codeOnlyMatch[2]);
      const found = matchCatalogItem(catalog, code, '');
      if (found && qty > 0) {
        extracted.push({
          code: found.code,
          name: found.name,
          doc: qty,
          act: qty,
        });
      }
    }
  }

  return catalog.length ? reconcileExtractedLinesWithCatalog(extracted, catalog) : extracted;
}

export interface ApplyReceiptResult {
  updatedItems: StockItem[];
  savedLines: ReceiptLine[];
  matchedCount: number;
  newCount: number;
  totalAddedCarry: number;
  changes: Array<{
    code: string;
    name: string;
    prevCarry: number;
    addedCarry: number;
    nextCarry: number;
    isNew: boolean;
  }>;
}

export function applyReceiptToStockItems(
  items: StockItem[],
  lines: ReceiptLine[],
  mode: 'add' | 'set' = 'add'
): ApplyReceiptResult {
  const taken: string[] = [];
  const savedLines: ReceiptLine[] = [];
  const updatedItems = [...items];
  const changes: ApplyReceiptResult['changes'] = [];
  let matchedCount = 0;
  let newCount = 0;
  let totalAddedCarry = 0;

  const reconciledLines = reconcileExtractedLinesWithCatalog(lines, updatedItems);

  for (const r of reconciledLines) {
    const qty = Math.max(0, N(r.act));
    const docQty = Math.max(0, N(r.doc > 0 ? r.doc : qty));
    if (!r.name.trim() && !r.code) continue;

    const matched = matchCatalogItem(updatedItems, r.code, r.name);
    const existingIdx = matched
      ? updatedItems.findIndex((z) => !z.deleted && z.code === matched.code)
      : -1;

    if (existingIdx >= 0) {
      const existing = updatedItems[existingIdx];
      const code = existing.code;
      const prevCarry = N(existing.carry);
      const nextCarry =
        mode === 'set' ? qty : Math.round((prevCarry + qty) * 1000) / 1000;
      const nextRecv = Math.round((N(existing.recv) + qty) * 1000) / 1000;

      updatedItems[existingIdx] = {
        ...existing,
        carry: nextCarry,
        recv: nextRecv,
      };

      matchedCount++;
      totalAddedCarry += qty;
      savedLines.push({ code, name: existing.name, doc: docQty, act: qty });
      changes.push({
        code,
        name: existing.name,
        prevCarry,
        addedCarry: qty,
        nextCarry,
        isNew: false,
      });
    } else {
      const code = nextCode(
        updatedItems.map((u) => u.code),
        taken
      );
      taken.push(code);
      const cleanName = r.name.trim();
      updatedItems.push({
        code,
        name: cleanName,
        cat: 'ขนมอบ',
        carry: qty,
        actual: qty,
        out: 0,
        sold: 0,
        broken: 0,
        recv: qty,
        counted: false,
        deleted: false,
        kind: 'snack',
        unit: 'ชิ้น',
        price: 0,
        cost: 0,
      });

      newCount++;
      totalAddedCarry += qty;
      savedLines.push({ code, name: cleanName, doc: docQty, act: qty });
      changes.push({
        code,
        name: cleanName,
        prevCarry: 0,
        addedCarry: qty,
        nextCarry: qty,
        isNew: true,
      });
    }
  }

  return {
    updatedItems,
    savedLines,
    matchedCount,
    newCount,
    totalAddedCarry: Math.round(totalAddedCarry * 1000) / 1000,
    changes,
  };
}

