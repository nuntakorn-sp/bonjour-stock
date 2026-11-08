import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calc,
  unitPriceFor,
  nextCode,
  nextCodeForKind,
  normalizeStockItems,
  calculateCashSummary,
  calculateFinanceMetrics,
  computeNextShiftItem,
  buildShiftVariances,
  parseReceivingRows,
  parseReceivingText,
  matchCatalogItem,
  applyReceiptToStockItems,
  shiftDay,
  baht,
} from './calculations';
import { INITIAL_SEED } from '../data/seedData';
import { StockItem } from '../types';

test('calc computes open, net, and diff accurately', () => {
  const res = calc({ carry: 131, actual: 131, out: 0, sold: 5, broken: 0 });
  assert.equal(res.open, 131);
  assert.equal(res.net, 126);
  assert.equal(res.diff, 0);

  const oversold = calc({ carry: 10, actual: 8, out: 1, sold: 10, broken: 2 });
  assert.equal(oversold.open, 7);
  assert.equal(oversold.net, -5);
  assert.equal(oversold.diff, -2);
});

test('unitPriceFor handles full, pct, and fixed pricing rules', () => {
  assert.equal(unitPriceFor({ price: 40 }, { rule: 'full', value: 0 }), 40);
  assert.equal(unitPriceFor({ price: 40 }, { rule: 'pct', value: 25 }), 30);
  assert.equal(unitPriceFor({ price: 40 }, { rule: 'fixed', value: 19 }), 19);
});

test('nextCode and nextCodeForKind increment codes consistently per item kind', () => {
  assert.equal(nextCode(['1001', '1004', '1005']), '1006');
  assert.equal(nextCode(['M01', 'M25']), 'M26');
  assert.equal(
    nextCodeForKind(
      [
        { code: '84007', kind: 'snack' },
        { code: 'M01', kind: 'material' },
        { code: 'M26', kind: 'material' },
      ],
      'material'
    ),
    'M27'
  );
  assert.equal(
    nextCodeForKind(
      [
        { code: '84007', kind: 'snack' },
        { code: 'M26', kind: 'material' },
      ],
      'snack'
    ),
    '84008'
  );
});

test('normalizeStockItems fixes typos and unifies all raw material codes to Mxx', () => {
  const normalized = normalizeStockItems(INITIAL_SEED.items as StockItem[]);
  const activeMaterials = normalized.filter((o) => !o.deleted && o.kind === 'material');
  assert.equal(activeMaterials.length, 26);
  assert.ok(activeMaterials.every((o) => /^M\d{2}$/.test(o.code)));
  assert.equal(activeMaterials.find((o) => o.code === 'M25')?.name, 'กระเป๋าผ้า');
  assert.equal(activeMaterials.find((o) => o.code === 'M18')?.name, 'ถุงบองชู');
  assert.equal(activeMaterials.find((o) => o.code === 'M03')?.name, 'ลูกเกต');
});

test('calculateCashSummary computes gross, remit, and system variance without subtracting float', () => {
  const shift = {
    date: '2026-11-04',
    branch: 'อมตะนคร',
    cash: 100,
    qr: 140,
    pos: 240,
    float: 3000,
    floatEnd: 2950,
    locked: false,
    expenses: [],
  };
  const saleLines = [
    {
      id: '1',
      date: '2026-11-04',
      code: '1001',
      typeId: 'normal',
      qty: 31,
      unitPrice: 20,
      unitCost: 0,
      amount: 720,
      ts: 1,
    },
  ];
  const res = calculateCashSummary(shift, saleLines);
  assert.equal(res.gross, 240);
  assert.equal(res.remit, 100);
  assert.equal(res.sysSales, 720);
  assert.equal(res.dif, -480);
  assert.equal(res.floatEnd, 2950);
  assert.equal(res.floatDiff, -50);
  assert.equal(res.posMatches, true);
});

test('calculateFinanceMetrics aggregates sales, costs, and profit bar percentage', () => {
  const metrics = calculateFinanceMetrics({
    anchorDate: '2026-11-04',
    spanDays: 1,
    shiftDate: '2026-11-04',
    liveItems: [],
    saleLines: [
      {
        id: '1',
        date: '2026-11-04',
        code: '1001',
        typeId: 'normal',
        qty: 5,
        unitPrice: 29,
        unitCost: 0,
        amount: 720,
        ts: 1,
      },
    ],
    dailyRecords: [],
    variances: [],
  });
  assert.equal(metrics.rev, 720);
  assert.equal(metrics.profit, 720);
  assert.equal(metrics.gp, 100);
});

test('computeNextShiftItem and buildShiftVariances preserve shortage and surplus across shift close', () => {
  const shortageItem: StockItem = {
    code: '1001',
    name: 'ครัวซองต์เนยสด',
    cat: 'ขนมอบ',
    carry: 131,
    actual: 128, // diff = -3 (ขาด)
    out: 0,
    sold: 5,
    broken: 0,
    recv: 0,
    counted: true,
    cost: 10,
  };
  const surplusItem: StockItem = {
    code: '1004',
    name: 'ฮาวายเอี้ยน',
    cat: 'ขนมอบ',
    carry: 203,
    actual: 208, // diff = +5 (เกิน)
    out: 0,
    sold: 10,
    broken: 0,
    recv: 0,
    counted: true,
    cost: 12,
  };
  const matchedItem: StockItem = {
    code: '1005',
    name: 'ช็อกโกแลตสติ๊ก',
    cat: 'ขนมอบ',
    carry: 362,
    actual: 362, // diff = 0 (ตรงยอด)
    out: 0,
    sold: 15,
    broken: 0,
    recv: 0,
    counted: true,
    cost: 8,
  };

  const nextShortage = computeNextShiftItem(shortageItem);
  assert.equal(nextShortage.carry, 126);
  assert.equal(nextShortage.actual, 123);
  assert.equal(calc(nextShortage).diff, -3);

  const nextSurplus = computeNextShiftItem(surplusItem);
  assert.equal(nextSurplus.carry, 193);
  assert.equal(nextSurplus.actual, 198);
  assert.equal(calc(nextSurplus).diff, 5);

  const nextMatched = computeNextShiftItem(matchedItem);
  assert.equal(nextMatched.carry, 347);
  assert.equal(nextMatched.actual, 347);
  assert.equal(calc(nextMatched).diff, 0);

  const variances = buildShiftVariances(
    '2026-11-04',
    [shortageItem, surplusItem, matchedItem],
    [],
    1000
  );
  assert.equal(variances.length, 2);
  assert.equal(variances[0].code, '1001');
  assert.equal(variances[0].diff, -3);
  assert.equal(variances[0].status, 'pending');
  assert.equal(variances[1].code, '1004');
  assert.equal(variances[1].diff, 5);
  assert.equal(variances[1].status, 'pending');
});

test('parseReceivingRows extracts items with headers and headerless rows without confusing product codes for quantities', () => {
  const catalog = normalizeStockItems(INITIAL_SEED.items as StockItem[]);
  const rows = [
    ['สินค้า', 'ตามเอกสาร', 'รับจริง'],
    ['แลตติซสตรอว์เบอร์รี', 20, 20],
    ['บราวนี่', 15, 14],
  ];
  const parsed = parseReceivingRows(rows, catalog);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { code: '1052', name: 'แลตติซสตรอว์เบอร์รี', doc: 20, act: 20 });
  assert.deepEqual(parsed[1], { code: '4002', name: 'บราวนี่', doc: 15, act: 14 });

  // Headerless rows with product codes in first column
  const codeRows = [
    ['1052', 'แลตติซสตรอเบอรี่', 18],
    ['M6', 'ID Box', 5],
  ];
  const parsedCodes = parseReceivingRows(codeRows, catalog);
  assert.equal(parsedCodes.length, 2);
  assert.deepEqual(parsedCodes[0], { code: '1052', name: 'แลตติซสตรอว์เบอร์รี', doc: 18, act: 18 });
  assert.deepEqual(parsedCodes[1], { code: 'M06', name: 'ID Box', doc: 5, act: 5 });
});

test('matchCatalogItem, parseReceivingText, and applyReceiptToStockItems accurately add to carry (ยอดยกเข้า)', () => {
  const catalog = normalizeStockItems(INITIAL_SEED.items as StockItem[]);
  assert.equal(matchCatalogItem(catalog, '1052', '')?.name, 'แลตติซสตรอว์เบอร์รี');
  assert.equal(matchCatalogItem(catalog, '', 'แลตติซสตรอเบอรี่')?.code, '1052');
  assert.equal(matchCatalogItem(catalog, '', 'Mini Choco Stick')?.code, '1045');

  const text = [
    '1052 แลตติซสตรอว์เบอร์รี 18',
    '4002 บราวนี่ 27',
    'M14 ถั่วบด 5',
  ].join('\n');
  const lines = parseReceivingText(text, catalog);
  assert.equal(lines.length, 3);

  const prev1052 = catalog.find((o) => o.code === '1052')!.carry;
  const prev4002 = catalog.find((o) => o.code === '4002')!.carry;
  const prevM14 = catalog.find((o) => o.code === 'M14')!.carry;

  const result = applyReceiptToStockItems(catalog, lines, 'add');
  assert.equal(result.matchedCount, 3);
  assert.equal(result.newCount, 0);
  assert.equal(result.totalAddedCarry, 50);

  const after1052 = result.updatedItems.find((o) => o.code === '1052')!;
  const after4002 = result.updatedItems.find((o) => o.code === '4002')!;
  const afterM14 = result.updatedItems.find((o) => o.code === 'M14')!;

  assert.equal(after1052.carry, prev1052 + 18);
  assert.equal(after4002.carry, prev4002 + 27);
  assert.equal(afterM14.carry, prevM14 + 5);
});

test('shiftDay and baht formatting work properly', () => {
  assert.equal(shiftDay('2026-11-04', -1), '2026-11-03');
  assert.equal(baht(720), '฿720.00');
});



