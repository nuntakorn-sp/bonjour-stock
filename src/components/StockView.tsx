import React from 'react';
import { StockItem, ShiftData, VarianceRecord } from '../types';
import { N, fmt, calc, isC } from '../utils/calculations';
import { Icon } from './Icons';

interface StockViewProps {
  items: StockItem[];
  liveItems: StockItem[];
  shift: ShiftData;
  variances: VarianceRecord[];
  kind: 'snack' | 'material';
  setKind: (k: 'snack' | 'material') => void;
  cat: string;
  setCat: (c: string) => void;
  q: string;
  setQ: (q: string) => void;
  openDetails: Record<string, boolean>;
  setOpenDetails: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onStepActual: (code: string, delta: number) => void;
  onSetField: (code: string, field: keyof StockItem, rawValue: string | number) => void;
  onMatchItem: (code: string) => void;
  onMatchAll: () => void;
  onOpenAdd: () => void;
  onOpenSale: (code: string) => void;
  onOpenPad: (code: string, field: keyof StockItem) => void;
  onOpenDetail: (key: 'counted' | 'check' | 'sold' | 'net') => void;
  onOpenVariances: () => void;
  onHideItem: (code: string) => void;
  t: (s: string) => string;
}

export const StatusPill: React.FC<{ item: StockItem; t: (s: string) => string }> = ({ item, t }) => {
  const c = calc(item);
  if (c.net < 0) {
    return (
      <span className="pill bad">
        <Icon name="arrowDown" size={13} /> {t('ขายเกินสต๊อก')} {fmt(-c.net)} {t('ชิ้น')}
      </span>
    );
  }
  if (c.diff !== 0) {
    const isPlus = c.diff > 0;
    return (
      <span className={`pill ${isPlus ? 'plus' : 'bad'}`}>
        <Icon name={isPlus ? 'arrowUp' : 'arrowDown'} size={13} /> {t('ผลต่าง')}{' '}
        {isPlus ? '+' : ''}
        {fmt(c.diff)} {t('ชิ้น')}
      </span>
    );
  }
  if (!isC(item)) {
    return <span className="pill">{t('ยังไม่นับ')}</span>;
  }
  // Status: this item has been counted and the count matches. Use "นับแล้ว" so it
  // doesn't collide with the action-button labelled "ตรงยอด" below (which MAKES it match).
  return (
    <span className="pill ok">
      <Icon name="check" size={13} /> {t('นับแล้ว')}
    </span>
  );
};

export const StockView: React.FC<StockViewProps> = ({
  items,
  liveItems,
  shift,
  variances,
  kind,
  setKind,
  cat,
  setCat,
  q,
  setQ,
  openDetails,
  setOpenDetails,
  onStepActual,
  onSetField,
  onMatchItem,
  onMatchAll,
  onOpenAdd,
  onOpenSale,
  onOpenPad,
  onOpenDetail,
  onOpenVariances,
  onHideItem,
  t,
}) => {
  const L = liveItems.filter((o) => (o.kind || 'snack') === kind);
  const cats = Array.from(new Set(L.map((o) => o.cat || 'ไม่ระบุหมวด')));
  const query = q.trim().toLowerCase();

  const list = L.filter((o) => {
    const c = calc(o);
    const catMatch =
      cat === 'all' ||
      (cat === '__un'
        ? !isC(o)
        : cat === '__chk'
        ? c.diff !== 0 || c.net < 0
        : (o.cat || 'ไม่ระบุหมวด') === cat);
    const qMatch =
      !query ||
      String(o.code).toLowerCase().includes(query) ||
      String(o.name).toLowerCase().includes(query);
    return catMatch && qMatch;
  });

  const T = L.reduce(
    (a, o) => {
      const c = calc(o);
      a.carry += N(o.carry);
      a.actual += N(o.actual);
      a.sold += N(o.sold);
      a.net += c.net;
      a.diff += c.diff;
      return a;
    },
    { carry: 0, actual: 0, sold: 0, net: 0, diff: 0 }
  );

  const lock = shift.locked;
  const pendV = (variances || []).filter((v) => v.status === 'pending');
  const nc = L.filter(isC).length;
  const chk = L.filter((o) => {
    const c = calc(o);
    return c.diff !== 0 || c.net < 0;
  }).length;

  const snackCount = items.filter((o) => !o.deleted && (o.kind || 'snack') === 'snack').length;
  const matCount = items.filter((o) => !o.deleted && o.kind === 'material').length;

  return (
    <div>
      <div className="grid-2 c4">
        <button type="button" className="box stat" onClick={() => onOpenDetail('counted')}>
          <small>
            <Icon name="check" size={15} />
            {t('นับแล้ว (รายการ)')}
          </small>
          <b>
            {nc}/{L.length}
          </b>
          <span className="prog">
            <i style={{ width: `${L.length ? (nc / L.length) * 100 : 0}%` }} />
          </span>
        </button>

        <button type="button" className="box stat" onClick={() => onOpenDetail('check')}>
          <small>
            <Icon name="alert" size={15} />
            {t('ต้องตรวจ (รายการ)')}
          </small>
          <b>{chk}</b>
        </button>

        <button type="button" className="box stat" onClick={() => onOpenDetail('sold')}>
          <small>
            <Icon name="report" size={15} />
            {t('ขายแล้ว (ชิ้น)')}
          </small>
          <b>{fmt(T.sold)}</b>
        </button>

        <button type="button" className="box inv stat" onClick={() => onOpenDetail('net')}>
          <small>
            <Icon name="stock" size={15} />
            {t('คงเหลือสุทธิ (ชิ้น)')}
          </small>
          <b>{fmt(T.net)}</b>
        </button>
      </div>

      {lock && (
        <p className="pill warn">
          <Icon name="lock" size={14} /> {t('กะนี้ล็อกแล้ว แก้ไขไม่ได้')}
        </p>
      )}

      {pendV.length > 0 && (
        <div className="dstat warn" style={{ marginTop: 10 }}>
          <span className="st">
            <Icon name="alert" size={16} />
            <span>
              {t('ผลต่างค้างจากกะก่อน')} {pendV.length}{' '}
              {t('รายการ · ต้องปิดประเด็นพร้อมหมายเหตุ')}
            </span>
          </span>
          <button type="button" className="dnow" onClick={onOpenVariances}>
            {t('ดูและปิดประเด็น')}
          </button>
        </div>
      )}

      <div className="chips" role="group" aria-label={t('ประเภทรายการ')}>
        <button
          type="button"
          className="chip"
          aria-pressed={kind === 'snack'}
          onClick={() => {
            setKind('snack');
            setCat('all');
            setQ('');
          }}
        >
          {t('ขนม')} ({snackCount})
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={kind === 'material'}
          onClick={() => {
            setKind('material');
            setCat('all');
            setQ('');
          }}
        >
          {t('วัตถุดิบ/อุปกรณ์')} ({matCount})
        </button>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div className="grow">
          <input
            type="text"
            id="q"
            placeholder={t('ค้นหารหัสหรือชื่อสินค้า')}
            value={q}
            aria-label={t('ค้นหาสินค้า')}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {L.some((o) => !isC(o)) && (
          <button type="button" onClick={onMatchAll} disabled={lock}>
            {t('ตรงยอดทั้งหมด')}
          </button>
        )}
        <button type="button" className="pri" onClick={onOpenAdd} disabled={lock}>
          <Icon name="plus" size={16} />
          {t('เพิ่มสินค้า')}
        </button>
      </div>

      <div className="chips" role="group" aria-label={t('กรองหมวด')}>
        <button
          type="button"
          className="chip"
          aria-pressed={cat === 'all'}
          onClick={() => setCat('all')}
        >
          {t('ทั้งหมด')} ({L.length})
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={cat === '__un'}
          onClick={() => setCat('__un')}
        >
          {t('ยังไม่นับ')} ({L.length - nc})
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={cat === '__chk'}
          onClick={() => setCat('__chk')}
        >
          {t('ต้องตรวจ')} ({chk})
        </button>
        {cats.map((c) => (
          <button
            type="button"
            key={c}
            className="chip"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
          >
            {t(c)} ({L.filter((o) => (o.cat || 'ไม่ระบุหมวด') === c).length})
          </button>
        ))}
      </div>

      {!L.length ? (
        <div className="empty">
          {t('ยังไม่มีสินค้าในฐานข้อมูล')}
          <br />
          {t('เริ่มจาก "ตั้งค่า → นำเข้าไฟล์สำรอง" หรือกด "เพิ่มสินค้า"')}
        </div>
      ) : !list.length ? (
        <div className="empty">{t('ไม่พบสินค้าที่ตรงกับคำค้น')}</div>
      ) : (
        <div className="cards">
          {list.map((o) => {
            const c = calc(o);
            const isM = o.kind === 'material';
            const un = o.unit || 'ชิ้น';

            const renderNumField = (field: 'sold' | 'broken' | 'carry' | 'out', label: string) => {
              const isReadonlyPad = !isM;
              return (
                <div>
                  <label htmlFor={`${o.code}-${field}`}>{label}</label>
                  <input
                    type="number"
                    inputMode={isM ? 'decimal' : 'numeric'}
                    min="0"
                    step={isM ? '0.001' : '1'}
                    id={`${o.code}-${field}`}
                    value={N(o[field])}
                    disabled={lock}
                    readOnly={isReadonlyPad}
                    onClick={() => {
                      if (isReadonlyPad && !lock) {
                        if (field === 'sold') {
                          onOpenSale(o.code);
                        } else {
                          onOpenPad(o.code, field);
                        }
                      }
                    }}
                    onChange={(e) => {
                      if (!isReadonlyPad) onSetField(o.code, field, e.target.value);
                    }}
                  />
                </div>
              );
            };

            return (
              <article key={o.code} className="card">
                <div className="top">
                  <b title={t(o.name)}>{t(o.name)}</b>
                  <StatusPill item={o} t={t} />
                  <span className="code">
                    {t('รหัส')} {o.code}
                  </span>
                </div>

                <div className="main">
                  <div>
                    <label htmlFor={`${o.code}-actual`}>
                      {t('นับจริง')} ({t('ชิ้น')})
                    </label>
                    <div className="stp">
                      <button
                        type="button"
                        aria-label={`${t('ลด 1')} ${o.name}`}
                        disabled={lock}
                        onClick={() => onStepActual(o.code, -1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode={isM ? 'decimal' : 'numeric'}
                        min="0"
                        step={isM ? '0.001' : '1'}
                        id={`${o.code}-actual`}
                        value={N(o.actual)}
                        disabled={lock}
                        onChange={(e) => onSetField(o.code, 'actual', e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={`${t('เพิ่ม 1')} ${o.name}`}
                        disabled={lock}
                        onClick={() => onStepActual(o.code, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <label>
                      {t('คงเหลือสุทธิ')} ({t('ชิ้น')})
                    </label>
                    <div className={`net ${c.net < 0 ? 'neg' : ''}`}>{fmt(c.net)}</div>
                  </div>
                </div>

                {!lock && (
                  <div className="actrow">
                    {o.matchPrev ? (
                      <button
                        type="button"
                        className="chip match-btn"
                        style={{ borderColor: 'var(--bad)' }}
                        onClick={() => onMatchItem(o.code)}
                      >
                        {t('ตรวจนับ')}
                      </button>
                    ) : isC(o) && c.diff === 0 ? (
                      <button
                        type="button"
                        className="chip match-btn"
                        style={{ borderColor: 'var(--bad)' }}
                        onClick={() => onMatchItem(o.code)}
                        title={t('กดเพื่อยกเลิกการนับและนับใหม่')}
                      >
                        {t('นับใหม่')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="chip match-btn"
                        onClick={() => onMatchItem(o.code)}
                        title={t('ตั้งนับจริงให้เท่ากับยอดยกเข้า')}
                      >
                        {t('ตั้งตรงยอด')}
                      </button>
                    )}
                  </div>
                )}

                {isM && (
                  <p className="hint">
                    {t('ยอดยกเข้า')} {fmt(o.carry)} · {t('เข้า')} {fmt(o.recv)} {un}
                  </p>
                )}

                <div className="fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {renderNumField('sold', isM ? `${t('ใช้ไป')} (${un})` : `${t('ขาย')} (${t('ชิ้น')})`)}
                  {renderNumField(
                    'broken',
                    isM ? `${t('ของเสีย')} (${un})` : `${t('ของเสีย')} (${t('ชิ้น')})`
                  )}
                </div>

                <details
                  open={!!openDetails[o.code]}
                  onToggle={(e) => {
                    const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                    setOpenDetails((prev) => ({ ...prev, [o.code]: isOpen }));
                  }}
                >
                  <summary>{t('ยอดยกเข้า / โอนออก / ซ่อนสินค้า')}</summary>
                  <div className="dbody">
                    <div className="dinner">
                      <div className="fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        {renderNumField('carry', t('ยอดยกเข้า'))}
                        {renderNumField('out', t('โอนออก'))}
                      </div>

                      {!isM && (
                        <>
                          <div style={{ marginTop: 10 }}>
                            <label htmlFor={`${o.code}-price`}>
                              {t('ราคาต่อชิ้น (บาท) ใช้คิดยอดขาย')}
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              id={`${o.code}-price`}
                              value={N(o.price)}
                              disabled={lock}
                              readOnly
                              onClick={() => !lock && onOpenPad(o.code, 'price')}
                            />
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <label htmlFor={`${o.code}-cost`}>
                              {t('ต้นทุนต่อชิ้น (บาท) ใช้คิดกำไร')}
                            </label>
                            <input
                              type="number"
                              inputMode="none"
                              min="0"
                              step="1"
                              id={`${o.code}-cost`}
                              value={N(o.cost)}
                              disabled={lock}
                              readOnly
                              onClick={() => !lock && onOpenPad(o.code, 'cost')}
                            />
                          </div>
                        </>
                      )}

                      <div className="row" style={{ marginTop: 10 }}>
                        <span className="hint grow">
                          {t('เปิด')} {fmt(c.open)} · {t('ขาย')} {fmt(o.sold)} · {t('เหลือ')}{' '}
                          {fmt(c.net)} {t('ชิ้น')}
                        </span>
                        <button
                          type="button"
                          className="danger"
                          disabled={lock}
                          onClick={() => onHideItem(o.code)}
                        >
                          {t('ซ่อนสินค้านี้')}
                        </button>
                      </div>
                    </div>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
