import React, { useState } from 'react';
import {
  StockItem,
  SaleType,
  SaleLine,
  VarianceRecord,
  UserProfile,
  DailyRecord,
} from '../types';
import {
  N,
  fmt,
  baht,
  calc,
  isC,
  unitPriceFor,
  shiftDay,
  nextCodeForKind,
} from '../utils/calculations';
import { Icon } from './Icons';

// 1. Numeric Keypad Modal (MoneyPad / ItemPad)
export const KeypadModal: React.FC<{
  title: string;
  subtitle: string;
  initialValue: string;
  allowDecimal: boolean;
  onConfirm: (val: string) => void;
  onClose: () => void;
  t: (s: string) => string;
}> = ({ title, subtitle, initialValue, allowDecimal, onConfirm, onClose, t }) => {
  const [s, setS] = useState(initialValue === '0' ? '' : initialValue);

  const displayVal = () => {
    if (s === '') return '0';
    const parts = s.split('.');
    return (
      Number(parts[0] || 0).toLocaleString('en-US') +
      (parts.length > 1 ? '.' + parts[1] : '')
    );
  };

  const handleDigit = (d: string) => {
    if (s === '0') {
      setS(d);
      return;
    }
    const parts = s.split('.');
    if (parts.length > 1) {
      if (parts[1].length >= 2) return;
    } else if (parts[0].length >= (allowDecimal ? 9 : 6)) {
      return;
    }
    setS(s + d);
  };

  const handleDot = () => {
    if (!allowDecimal || s.includes('.')) return;
    setS((s === '' ? '0' : s) + '.');
  };

  const commit = () => {
    const cleaned = s.endsWith('.') ? s.slice(0, -1) : s;
    onConfirm(cleaned);
  };

  return (
    <div
      className="modal-backdrop pad-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) commit();
      }}
    >
      <div className="modal-card pad" role="dialog" aria-modal="true" aria-label={title}>
        <div className="padh">
          <b>{title}</b>
          <span>{subtitle}</span>
        </div>
        <div className="padv">
          <span id="pv">{displayVal()}</span>
        </div>
        <div className="padk">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button type="button" key={n} onClick={() => handleDigit(n)}>
              {n}
            </button>
          ))}
          {allowDecimal ? (
            <button type="button" onClick={handleDot}>
              .
            </button>
          ) : (
            <button type="button" onClick={() => setS('')}>
              {t('ล้าง')}
            </button>
          )}
          <button type="button" onClick={() => handleDigit('0')}>
            0
          </button>
          <button type="button" aria-label={t('ลบ')} onClick={() => setS(s.slice(0, -1))}>
            ⌫
          </button>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          {allowDecimal && (
            <button type="button" onClick={() => setS('')}>
              {t('ล้าง')}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {t('ยกเลิก')}
          </button>
          <button type="button" className="pri" onClick={commit}>
            {t('ตกลง')}
          </button>
        </div>
      </div>
    </div>
  );
};

// 2. Detail Breakdown Modal (counted / check / sold / net)
export const DetailModal: React.FC<{
  detailKey: 'counted' | 'check' | 'sold' | 'net';
  liveItems: StockItem[];
  onClose: () => void;
  t: (s: string) => string;
}> = ({ detailKey, liveItems, onClose, t }) => {
  const L = liveItems.map((o) => ({ ...o, ...calc(o) }));
  const grp = (field: 'sold' | 'net') => {
    const g: Record<string, number> = {};
    L.forEach((o) => {
      const c = o.cat || 'ไม่ระบุหมวด';
      g[c] = (g[c] || 0) + N(o[field]);
    });
    return Object.entries(g).sort((a, b) => b[1] - a[1]);
  };

  let title = '';
  let sub = '';
  let content: React.ReactNode = null;

  if (detailKey === 'counted') {
    title = t('สถานะการนับ');
    const todo = L.filter((o) => !isC(o));
    const done = L.filter(isC);
    sub = `${t('นับแล้ว')} ${done.length} ${t('จาก')} ${L.length} ${t('รายการ')}`;
    content = (
      <div className="scroll">
        <table className="check-table">
          <thead>
            <tr>
              <th>{t('รหัส')}</th>
              <th className="col-text">{t('สินค้า')}</th>
              <th>{t('สถานะ')}</th>
            </tr>
          </thead>
          <tbody>
            {[...todo, ...done].map((o) => (
              <tr key={o.code}>
                <td>{o.code}</td>
                <td className="col-text">{o.name}</td>
                <td>
                  {isC(o) ? (
                    <>
                      <Icon name="check" size={13} /> {t('นับแล้ว')}
                    </>
                  ) : (
                    <span className="pill">{t('ยังไม่นับ')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (detailKey === 'check') {
    title = t('รายการที่ต้องตรวจ');
    const bad = L.filter((o) => o.diff !== 0 || o.net < 0);
    sub = t('ผลต่าง = นับจริง − ยอดยกเข้า · ขายเกินสต๊อกเมื่อคงเหลือติดลบ');
    content = bad.length ? (
      <div className="scroll">
        <table className="check-table">
          <thead>
            <tr>
              <th>{t('รหัส')}</th>
              <th>{t('สินค้า')}</th>
              <th>{t('ยอดยกเข้า')}</th>
              <th>{t('นับจริง')}</th>
              <th className="col-diff">
                <span className="diff-box">{t('ผลต่าง')}</span>
              </th>
              <th>{t('คงเหลือ')}</th>
            </tr>
          </thead>
          <tbody>
            {bad.map((o) => (
              <tr key={o.code}>
                <td>{o.code}</td>
                <td>{o.name}</td>
                <td>{fmt(o.carry)}</td>
                <td>{fmt(o.actual)}</td>
                <td className="col-diff">
                  <span className="diff-box">
                    {o.diff !== 0 ? (
                      <span className={`pill ${o.diff > 0 ? 'plus' : 'bad'}`}>
                        <Icon name={o.diff > 0 ? 'arrowUp' : 'arrowDown'} size={13} />{' '}
                        {o.diff > 0 ? '+' : ''}
                        {fmt(o.diff)}
                      </span>
                    ) : (
                      fmt(o.diff)
                    )}
                  </span>
                </td>
                <td style={{ color: o.net < 0 ? 'var(--bad)' : 'inherit' }}>{fmt(o.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty">{t('ไม่มีรายการที่ต้องตรวจ')}</div>
    );
  } else if (detailKey === 'sold') {
    title = t('ยอดขายตามหมวด');
    const g = grp('sold');
    const tot = g.reduce((a, x) => a + x[1], 0);
    sub = `${t('ขายรวม')} ${fmt(tot)} ${t('ชิ้น')}`;
    content = (
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t('หมวด')}</th>
              <th>
                {t('ขาย')} ({t('ชิ้น')})
              </th>
            </tr>
          </thead>
          <tbody>
            {g.map(([c, v]) => (
              <tr key={c}>
                <td>{t(c)}</td>
                <td>{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    title = t('คงเหลือสุทธิตามหมวด');
    const g = grp('net');
    const tot = g.reduce((a, x) => a + x[1], 0);
    sub = `${t('รวม')} ${fmt(tot)} ${t('ชิ้น')} · ${t(
      'คงเหลือสุทธิ = นับจริง − โอนออก − ขาย − ของเสีย'
    )}`;
    content = (
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t('หมวด')}</th>
              <th>
                {t('คงเหลือ')} ({t('ชิ้น')})
              </th>
            </tr>
          </thead>
          <tbody>
            {g.map(([c, v]) => (
              <tr key={c}>
                <td>{t(c)}</td>
                <td>{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card wide" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="dlg-x" aria-label={t('ปิด')} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <h2 style={{ margin: '0 36px 4px 0' }}>{title}</h2>
        <p className="hint">{sub}</p>
        {content}
      </div>
    </div>
  );
};

// 3. Add Item Modal
export const AddItemModal: React.FC<{
  items: StockItem[];
  defaultKind?: 'snack' | 'material';
  categories: string[];
  onSave: (newItem: StockItem) => void;
  onClose: () => void;
  t: (s: string) => string;
}> = ({ items, defaultKind = 'snack', categories, onSave, onClose, t }) => {
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [kind, setKind] = useState<'snack' | 'material'>(defaultKind);
  const [spec, setSpec] = useState('');
  const [unit, setUnit] = useState('ชิ้น');
  const [cat, setCat] = useState('');
  const [catNew, setCatNew] = useState('');
  const [catNewEn, setCatNewEn] = useState('');
  const [openQty, setOpenQty] = useState('0');
  const [recQty, setRecQty] = useState('0');
  const [salesQty, setSalesQty] = useState('0');
  const [err, setErr] = useState('');

  const nextItemCode = nextCodeForKind(items, kind);

  const handleSave = () => {
    const trimmedName = name.trim();
    const finalCat = cat === '__new' ? catNew.trim() : cat;
    if (!trimmedName) {
      setErr(t('กรอกชื่อสินค้า'));
      return;
    }
    if (cat === '__new' && !finalCat) {
      setErr(t('กรอกชื่อหมวดใหม่'));
      return;
    }
    const op = Number(openQty);
    const rc = Number(recQty);
    const sa = Number(salesQty);
    if ([op, rc, sa].some((v) => !Number.isFinite(v) || v < 0)) {
      setErr(t('ตัวเลขต้องไม่ติดลบ'));
      return;
    }
    if (kind === 'snack' && (!Number.isInteger(op) || !Number.isInteger(rc) || !Number.isInteger(sa))) {
      setErr(t('ขนมต้องเป็นจำนวนเต็ม'));
      return;
    }

    onSave({
      code: nextItemCode,
      name: trimmedName,
      nameEn: nameEn.trim(),
      cat: finalCat || (kind === 'material' ? 'วัตถุดิบ' : 'ขนมอบ'),
      catEn: catNewEn.trim(),
      kind,
      spec: kind === 'material' ? '' : spec.trim(),
      unit: kind === 'material' ? unit.trim() || 'หน่วย' : 'ชิ้น',
      price: 0,
      cost: 0,
      carry: op,
      actual: op,
      recv: rc,
      sold: sa,
      out: 0,
      broken: 0,
      counted: true,
      deleted: false,
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={t('เพิ่มสินค้า')}>
        <h2 style={{ marginTop: 0 }}>{t('เพิ่มสินค้า')}</h2>
        <label htmlFor="n-code">{t('รหัสสินค้า (สร้างอัตโนมัติ)')}</label>
        <input type="text" id="n-code" value={nextItemCode} readOnly />

        <label htmlFor="n-name" style={{ marginTop: 8 }}>
          {t('ชื่อสินค้า')}
        </label>
        <input
          type="text"
          id="n-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label htmlFor="n-name-en" style={{ marginTop: 8 }}>
          {t('ชื่อภาษาอังกฤษ (ไม่บังคับ)')}
        </label>
        <input
          type="text"
          id="n-name-en"
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />

        <label htmlFor="n-kind" style={{ marginTop: 8 }}>
          {t('ประเภทรายการ')}
        </label>
        <select
          id="n-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'snack' | 'material')}
        >
          <option value="snack">{t('ขนม')}</option>
          <option value="material">{t('วัตถุดิบ/อุปกรณ์')}</option>
        </select>

        {kind === 'snack' ? (
          <div>
            <label htmlFor="n-spec" style={{ marginTop: 8 }}>
              {t('ขนาดถาด / บรรจุ (Spec)')}
            </label>
            <input
              type="text"
              id="n-spec"
              placeholder="เช่น 30pcs."
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="n-unit" style={{ marginTop: 8 }}>
              {t('หน่วยนับ (เช่น กรัม (g), ชิ้น)')}
            </label>
            <input
              type="text"
              id="n-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
        )}

        <label htmlFor="n-cat" style={{ marginTop: 8 }}>
          {t('หมวด')}
        </label>
        <select id="n-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">{t('ไม่ระบุหมวด')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(c)}
            </option>
          ))}
          <option value="__new">{t('+ เพิ่มหมวดใหม่')}</option>
        </select>

        {cat === '__new' && (
          <>
            <input
              type="text"
              placeholder={t('ชื่อหมวดใหม่')}
              style={{ marginTop: 8 }}
              value={catNew}
              onChange={(e) => setCatNew(e.target.value)}
            />
            <input
              type="text"
              placeholder={t('ชื่อหมวดภาษาอังกฤษ')}
              style={{ marginTop: 8 }}
              value={catNewEn}
              onChange={(e) => setCatNewEn(e.target.value)}
            />
          </>
        )}

        <div className="fields" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 10 }}>
          <div className="grow">
            <label htmlFor="n-open">
              {kind === 'material' ? t('ยอดยกเข้า (Brought)') : t('เปิดร้าน (Open)')}
            </label>
            <input
              type="number"
              min="0"
              id="n-open"
              value={openQty}
              onChange={(e) => setOpenQty(e.target.value)}
            />
          </div>
          <div className="grow">
            <label htmlFor="n-rec">
              {kind === 'material' ? t('สินค้าเข้า (Incoming)') : t('รับเข้า/อบ (Rec)')}
            </label>
            <input
              type="number"
              min="0"
              id="n-rec"
              value={recQty}
              onChange={(e) => setRecQty(e.target.value)}
            />
          </div>
          <div className="grow">
            <label htmlFor="n-sales">
              {kind === 'material' ? t('ใช้ไป (Used)') : t('ขายปกติ (Sales)')}
            </label>
            <input
              type="number"
              min="0"
              id="n-sales"
              value={salesQty}
              onChange={(e) => setSalesQty(e.target.value)}
            />
          </div>
        </div>

        {err && <div className="errt">{err}</div>}

        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>
            {t('ยกเลิก')}
          </button>
          <button type="button" className="pri" onClick={handleSave}>
            <Icon name="plus" size={16} />
            {t('บันทึกสินค้า')}
          </button>
        </div>
      </div>
    </div>
  );
};

// 4. Sale Channel Modal (`ประเภท`)
export const SaleChannelModal: React.FC<{
  item: StockItem;
  saleTypes: SaleType[];
  saleLines: SaleLine[];
  shiftDate: string;
  onSaveSales: (code: string, quantities: Record<string, number>) => void;
  onClose: () => void;
  t: (s: string) => string;
}> = ({ item, saleTypes, saleLines, shiftDate, onSaveSales, onClose, t }) => {
  const types = saleTypes.filter((st) => !st.hidden).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const todayLines = saleLines.filter((l) => l.date === shiftDate && l.code === item.code);

  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    let sumLines = 0;
    types.forEach((st) => {
      const q = todayLines
        .filter((l) => l.typeId === st.id)
        .reduce((a, l) => a + N(l.qty), 0);
      const cleanQ = Math.max(0, Math.floor(q));
      init[st.id] = cleanQ;
      sumLines += cleanQ;
    });
    const currentSold = Math.max(0, Math.floor(N(item.sold)));
    if (currentSold !== sumLines && types.length > 0) {
      const normId = types.find((st) => st.id === 'normal')?.id || types[0].id;
      init[normId] = Math.max(0, (init[normId] || 0) + (currentSold - sumLines));
    }
    return init;
  });

  const [padTypeId, setPadTypeId] = useState<string | null>(null);

  let totalQty = 0;
  let totalAmt = 0;
  types.forEach((st) => {
    const q = Math.max(0, Math.floor(N(qtys[st.id])));
    const p = unitPriceFor(item, st);
    totalQty += q;
    totalAmt += p * q;
  });

  if (padTypeId) {
    const activeType = types.find((st) => st.id === padTypeId);
    return (
      <KeypadModal
        title={t(item.name)}
        subtitle={activeType ? t(activeType.label) : ''}
        initialValue={String(N(qtys[padTypeId]))}
        allowDecimal={false}
        onConfirm={(val) => {
          const numVal = val === '' ? 0 : Math.max(0, Math.floor(Number(val)));
          setQtys((prev) => ({ ...prev, [padTypeId]: numVal }));
          setPadTypeId(null);
        }}
        onClose={() => setPadTypeId(null)}
        t={t}
      />
    );
  }

  const activeChannels = types.filter((st) => N(qtys[st.id]) > 0);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={t('บันทึกยอดจำหน่าย')}>
        <button type="button" className="dlg-x" aria-label={t('ปิด')} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <h2 style={{ margin: '0 36px 4px 0' }}>
          {t('บันทึกยอดจำหน่าย')} {types.length} {t('ช่องทาง')}
        </h2>
        <p className="hint">
          [{item.code}] {t(item.name)} · {t('ราคาเต็ม')} {baht(item.price)}
        </p>

        {types.map((st) => {
          const p = unitPriceFor(item, st);
          const q = N(qtys[st.id]);
          return (
            <div
              key={st.id}
              className="card row"
              style={{ alignItems: 'center', gap: 8, flexWrap: 'nowrap', padding: '10px 12px' }}
            >
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{t(st.label)}</b>
                <div className="hint">
                  {p === N(item.price) ? t('ราคาเต็ม') : `${t('ราคา')} ${baht(p)}`} · {t('กะนี้')}{' '}
                  {fmt(q)} {t('ชิ้น')}
                </div>
              </div>
              <div className="stp" style={{ width: 'auto', flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={`${t('ลด 1')} ${t(st.label)}`}
                  onClick={() =>
                    setQtys((prev) => ({
                      ...prev,
                      [st.id]: Math.max(0, N(prev[st.id]) - 1),
                    }))
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  id={`sq-${st.id}`}
                  aria-label={t(st.label)}
                  value={q}
                  readOnly
                  style={{ width: 64, cursor: 'pointer' }}
                  onClick={() => setPadTypeId(st.id)}
                />
                <button
                  type="button"
                  aria-label={`${t('เพิ่ม 1')} ${t(st.label)}`}
                  onClick={() =>
                    setQtys((prev) => ({
                      ...prev,
                      [st.id]: N(prev[st.id]) + 1,
                    }))
                  }
                >
                  +
                </button>
              </div>
              <span
                className="hint"
                style={{
                  minWidth: 72,
                  textAlign: 'right',
                  fontWeight: 600,
                  flexShrink: 0,
                  color: q > 0 ? 'var(--ink)' : undefined,
                }}
              >
                {baht(p * q)}
              </span>
            </div>
          );
        })}

        <div
          className="card"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'var(--bg)',
          }}
        >
          {activeChannels.length > 0 && (
            <div className="chips" style={{ marginTop: 0, marginBottom: 8 }}>
              {activeChannels.map((st) => (
                <span key={st.id} className="pill ok">
                  {t(st.label)}: {fmt(qtys[st.id])} {t('ชิ้น')}
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{t('รวมยอดจำหน่ายทั้งสิ้น')}</b>
            <b id="stot">
              {fmt(totalQty)} {t('ชิ้น')} · {baht(totalAmt)}
            </b>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>
            {t('ยกเลิก')}
          </button>
          <button
            type="button"
            className="pri"
            onClick={() => onSaveSales(item.code, qtys)}
          >
            {t('บันทึกยอดจำหน่าย')}
          </button>
        </div>
      </div>
    </div>
  );
};

// 5. Calendar Modal
export const CalendarModal: React.FC<{
  anchorDate: string;
  shiftDate: string;
  winN: number;
  daily: DailyRecord[];
  lang: 'th' | 'en';
  dmy: (s: string) => string;
  onSelectDate: (d: string) => void;
  onClose: () => void;
  t: (s: string) => string;
}> = ({ anchorDate, shiftDate, winN, daily, lang, dmy, onSelectDate, onClose, t }) => {
  const [monthStr, setMonthStr] = useState(anchorDate.slice(0, 7));
  const [Y, Mo] = monthStr.split('-').map(Number);
  const loc = lang === 'en' ? 'en-GB' : 'th-TH';

  const title = new Intl.DateTimeFormat(loc, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(Y, Mo - 1, 1)));

  const first = new Date(Date.UTC(Y, Mo - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(Y, Mo, 0)).getUTCDate();
  const wk = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    new Intl.DateTimeFormat(loc, { timeZone: 'UTC', weekday: 'short' }).format(
      new Date(Date.UTC(2023, 0, 1 + i))
    )
  );

  const ds: Record<string, string> = {};
  (daily || []).forEach((d) => {
    ds[d.date] = d.sample ? 's' : 'c';
  });
  ds[shiftDate] = 'l';

  const w0 = shiftDay(anchorDate, -(winN - 1));
  const maxM = shiftDate.slice(0, 7);

  const changeMonth = (delta: number) => {
    const next = new Date(Date.UTC(Y, Mo - 1 + delta, 1)).toISOString().slice(0, 7);
    if (next > maxM) return;
    setMonthStr(next);
  };

  return (
    <div
      className="modal-backdrop pad-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card cal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="calh">
          <button
            type="button"
            aria-label={t('เดือนก่อนหน้า')}
            onClick={() => changeMonth(-1)}
          >
            <Icon name="chl" size={20} />
          </button>
          <b>{title}</b>
          <button
            type="button"
            disabled={monthStr >= maxM}
            aria-label={t('เดือนถัดไป')}
            onClick={() => changeMonth(1)}
          >
            <Icon name="chr" size={20} />
          </button>
        </div>

        <div className="cwk" aria-hidden="true">
          {wk.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>

        <div className="cgd">
          {Array.from({ length: first }).map((_, i) => (
            <span key={`empty-${i}`} />
          ))}
          {Array.from({ length: days }).map((_, idx) => {
            const d = idx + 1;
            const x = `${monthStr}-${String(d).padStart(2, '0')}`;
            const fut = x > shiftDate;
            const st = ds[x];
            const sel = x === anchorDate;
            const inr = !sel && x >= w0 && x <= anchorDate && !fut;
            return (
              <button
                type="button"
                key={x}
                className={`cd${sel ? ' sel' : ''}${inr ? ' inr' : ''}${
                  x === shiftDate ? ' td' : ''
                }${st ? ' has ' + st : ''}`}
                disabled={fut}
                aria-pressed={sel}
                aria-label={dmy(x)}
                onClick={() => {
                  onSelectDate(x);
                  onClose();
                }}
              >
                {d}
              </button>
            );
          })}
        </div>

        <div className="cleg">
          <span>
            <i style={{ background: 'var(--ink)' }} />
            {t('ปิดยอดแล้ว')}
          </span>
          <span>
            <i style={{ boxShadow: 'inset 0 0 0 1.5px var(--mute)' }} />
            {t('ข้อมูลจำลอง')}
          </span>
          <span>
            <i style={{ background: 'var(--acc)' }} />
            {t('วันนี้ (สด)')}
          </span>
        </div>

        <div className="cfoot">
          <button
            type="button"
            onClick={() => {
              onSelectDate(shiftDay(shiftDate, -1));
              onClose();
            }}
          >
            {t('เมื่อวาน')}
          </button>
          <button
            type="button"
            className="pri"
            onClick={() => {
              onSelectDate(shiftDate);
              onClose();
            }}
          >
            {t('วันนี้')}
          </button>
          <button type="button" onClick={onClose}>
            {t('ปิด')}
          </button>
        </div>
      </div>
    </div>
  );
};

// 6. User Management Modal
export const UserEditModal: React.FC<{
  user: UserProfile;
  currentUserId?: string;
  onSaveUser: (updated: UserProfile) => Promise<void> | void;
  onUpdateStatus: (id: string, status: 'approved' | 'rejected') => Promise<void> | void;
  onResetPassword: (email: string) => Promise<void> | void;
  onDeleteUser: (user: UserProfile) => void;
  onClose: () => void;
  onToast: (msg: string, isErr?: boolean) => void;
  t: (s: string) => string;
}> = ({
  user,
  currentUserId,
  onSaveUser,
  onUpdateStatus,
  onResetPassword,
  onDeleteUser,
  onClose,
  onToast,
  t,
}) => {
  const [name, setName] = useState(user.name === '-' ? '' : user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState<'admin' | 'staff'>(user.role);
  const [busy, setBusy] = useState(false);
  const isMe = user.id === currentUserId;

  const statusLabel =
    user.status === 'approved'
      ? ['อนุมัติแล้ว', 'ok']
      : user.status === 'rejected'
      ? ['ระงับ', 'bad']
      : ['รออนุมัติ', 'warn'];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card wide" role="dialog" aria-modal="true" aria-label={user.name || user.email}>
        <button type="button" className="dlg-x" aria-label={t('ปิด')} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <h2 style={{ margin: '0 36px 4px 0' }}>{user.name || user.email || t('ผู้ใช้')}</h2>
        <p className="hint">{user.email}</p>

        <div className="row" style={{ gap: 6, margin: '10px 0 16px' }}>
          <span className={`pill ${statusLabel[1]}`}>{t(statusLabel[0])}</span>
          {user.role === 'admin' && <span className="pill">{t('ผู้ดูแล')}</span>}
          {user.must_change_password && (
            <span className="pill warn">{t('รอตั้งรหัสผ่านใหม่')}</span>
          )}
        </div>

        <h2 style={{ marginTop: 0 }}>{t('ข้อมูลผู้ใช้')}</h2>
        <label htmlFor="ue-n">{t('ชื่อ-นามสกุล')}</label>
        <input id="ue-n" type="text" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="ue-e" style={{ marginTop: 8 }}>
          {t('อีเมล')}
        </label>
        <input id="ue-e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="ue-r" style={{ marginTop: 8 }}>
          {t('สิทธิ์')}
        </label>
        <select
          id="ue-r"
          disabled={isMe}
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}
        >
          <option value="staff">{t('พนักงาน')}</option>
          <option value="admin">{t('ผู้ดูแล')}</option>
        </select>

        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="pri"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSaveUser({ ...user, name: name.trim(), email: email.trim(), role });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('บันทึกข้อมูล')}
          </button>
        </div>

        <h2 style={{ marginTop: 22 }}>{t('สถานะการเข้าใช้')}</h2>
        <div className="row" style={{ gap: 8 }}>
          {isMe ? (
            <span className="hint">{t('ไม่สามารถเปลี่ยนสถานะของตัวเองได้')}</span>
          ) : user.status === 'approved' ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onUpdateStatus(user.id, 'rejected');
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('ระงับการใช้งาน')}
            </button>
          ) : (
            <button
              type="button"
              className="pri"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onUpdateStatus(user.id, 'approved');
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('อนุมัติ')}
            </button>
          )}
        </div>

        <h2 style={{ marginTop: 22 }}>{t('รีเซ็ตรหัสผ่าน')}</h2>
        <p className="hint">
          {t('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของผู้ใช้ ผู้ใช้จะกดลิงก์ในอีเมลเพื่อตั้งรหัสผ่านใหม่ด้วยตัวเอง')}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            disabled={busy || !user.email}
            onClick={async () => {
              if (!user.email) {
                onToast(t('ผู้ใช้นี้ไม่มีอีเมล'), true);
                return;
              }
              setBusy(true);
              try {
                await onResetPassword(user.email);
                onToast(t('ส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมลแล้ว'));
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('ส่งลิงก์รีเซ็ตรหัสผ่าน')}
          </button>
        </div>

        {!isMe && (
          <>
            <h2 style={{ marginTop: 22 }}>{t('ลบบัญชี')}</h2>
            <p className="hint">{t('ลบถาวร ผู้ใช้นี้จะเข้าระบบไม่ได้อีก')}</p>
            <div className="row">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => {
                  onClose();
                  onDeleteUser(user);
                }}
              >
                {t('ลบบัญชีนี้')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 7. Variances Modal
export const VariancesModal: React.FC<{
  variances: VarianceRecord[];
  dmy: (s: string) => string;
  onResolve: (id: string, note: string) => void;
  onClose: () => void;
  onToast: (msg: string, isErr?: boolean) => void;
  t: (s: string) => string;
}> = ({ variances, dmy, onResolve, onClose, onToast, t }) => {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const P = variances.filter((v) => v.status === 'pending');
  const H = variances.filter((v) => v.status === 'resolved').slice(0, 30);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card wide" role="dialog" aria-modal="true" aria-label={t('ผลต่างค้างจากกะก่อน')}>
        <button type="button" className="dlg-x" aria-label={t('ปิด')} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <h2 style={{ margin: '0 36px 4px 0' }}>{t('ผลต่างค้างจากกะก่อน')}</h2>
        <p className="hint">{t('ปิดประเด็นได้เมื่อพบสาเหตุ ใส่หมายเหตุแล้วกดปิดประเด็น')}</p>

        {P.length ? (
          P.map((v) => (
            <div key={v.id} className="card">
              <div className="top">
                <b>{v.name || v.code}</b>
                <span className="code">{dmy(v.date)}</span>
                <span className={`pill ${N(v.diff) < 0 ? 'bad' : 'plus'}`}>
                  <Icon name={N(v.diff) < 0 ? 'arrowDown' : 'arrowUp'} size={13} />{' '}
                  {N(v.diff) > 0 ? '+' : ''}
                  {fmt(v.diff)} {t('ชิ้น')}
                </span>
              </div>
              <p className="hint">
                {t('ยอดยกเข้า')} {fmt(v.carry)} · {t('นับจริง')} {fmt(v.actual)}
              </p>
              <label htmlFor={`vn-${v.id}`}>{t('หมายเหตุ')}</label>
              <input
                type="text"
                id={`vn-${v.id}`}
                value={notes[v.id] || ''}
                onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })}
              />
              <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="pri"
                  onClick={() => {
                    const note = (notes[v.id] || '').trim();
                    if (!note) {
                      onToast(t('ใส่หมายเหตุก่อนปิดประเด็น'), true);
                      return;
                    }
                    onResolve(v.id, note);
                  }}
                >
                  {t('ปิดประเด็น')}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">{t('ไม่มีผลต่างค้าง')}</div>
        )}

        <h2 style={{ margin: '18px 0 6px' }}>{t('ประวัติผลต่าง')}</h2>
        {H.length ? (
          <div className="scroll">
            <table className="check-table">
              <thead>
                <tr>
                  <th>{t('วันที่')}</th>
                  <th>{t('รายการ')}</th>
                  <th>{t('ยอดระบบ')}</th>
                  <th>{t('นับจริง')}</th>
                  <th className="col-diff">
                    <span className="diff-box">{t('ผลต่าง')}</span>
                  </th>
                  <th className="col-text">{t('หมายเหตุ')}</th>
                  <th className="col-text">{t('ผู้ตรวจ')}</th>
                </tr>
              </thead>
              <tbody>
                {H.map((v) => (
                  <tr key={v.id}>
                    <td>{dmy(v.date)}</td>
                    <td>{v.name || v.code}</td>
                    <td>{fmt(v.carry)}</td>
                    <td>{fmt(v.actual)}</td>
                    <td className="col-diff">
                      <span className="diff-box">
                        {N(v.diff) !== 0 ? (
                          <span className={`pill ${N(v.diff) > 0 ? 'plus' : 'bad'}`}>
                            <Icon name={N(v.diff) > 0 ? 'arrowUp' : 'arrowDown'} size={13} />{' '}
                            {N(v.diff) > 0 ? '+' : ''}
                            {fmt(v.diff)}
                          </span>
                        ) : (
                          fmt(v.diff)
                        )}
                      </span>
                    </td>
                    <td className="col-text">{v.note || ''}</td>
                    <td className="col-text">{v.resolvedBy || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">{t('ยังไม่มีประวัติ')}</div>
        )}
      </div>
    </div>
  );
};

// 8. Generic Confirm Modal
export const ConfirmModal: React.FC<{
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  t: (s: string) => string;
}> = ({ title, body, confirmLabel, danger, onConfirm, onCancel, t }) => (
  <div
    className="modal-backdrop"
    onClick={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}
  >
    <div className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {body && (
        <p className="hint" style={{ whiteSpace: 'pre-line', fontSize: 15, color: 'var(--ink)' }}>
          {body}
        </p>
      )}
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel}>
          {t('ยกเลิก')}
        </button>
        <button type="button" className={danger ? 'danger' : 'pri'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// 9. Photo Preview Modal
export const PhotoModal: React.FC<{
  src: string;
  onClose: () => void;
  t: (s: string) => string;
}> = ({ src, onClose, t }) => (
  <div
    className="modal-backdrop"
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div className="modal-card wide" role="dialog" aria-modal="true" aria-label={t('รูปหลักฐาน')}>
      <button type="button" className="dlg-x" aria-label={t('ปิด')} onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
      <h2 style={{ margin: '0 36px 8px 0' }}>{t('รูปหลักฐาน')}</h2>
      <img src={src} alt={t('รูปหลักฐาน')} style={{ width: '100%', borderRadius: 10 }} />
    </div>
  </div>
);
