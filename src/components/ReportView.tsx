import React, { useState } from 'react';
import { StockItem, ShiftData, DailyRecord, SaleLine, VarianceRecord } from '../types';
import {
  N,
  fmt,
  baht,
  calc,
  shiftDay,
  calculateFinanceMetrics,
} from '../utils/calculations';
import { Icon } from './Icons';
import { StatusPill } from './StockView';

interface ReportViewProps {
  items: StockItem[];
  liveItems: StockItem[];
  shift: ShiftData;
  daily: DailyRecord[];
  saleLines: SaleLine[];
  variances: VarianceRecord[];
  lang: 'th' | 'en';
  dmy: (s: string) => string;
  onOpenCalendar: (anchorDate: string, winN: number, onSelectDate: (d: string) => void) => void;
  onOpenVariances: () => void;
  t: (s: string) => string;
}

const COLORS = [
  'var(--ink)',
  '#b45309',
  '#7c8da0',
  '#a8a29e',
  '#57534e',
  '#d6a35c',
  '#5b7a6b',
  '#8b5e83',
  '#4a6fa5',
  '#c2410c',
];

export const ReportView: React.FC<ReportViewProps> = ({
  items,
  liveItems,
  shift,
  daily,
  saleLines,
  variances,
  lang,
  dmy,
  onOpenCalendar,
  onOpenVariances,
  t,
}) => {
  const [ct, setCt] = useState<'bar' | 'donut' | 'line'>('bar');
  const [viewDay, setViewDay] = useState<string | null>(null);
  const [span, setSpan] = useState<'1' | '7' | '30'>('1');
  const [metric, setMetric] = useState<'sold' | 'net' | 'actual' | 'broken' | 'diff'>('sold');
  const [groupBy, setGroupBy] = useState<'item' | 'cat'>('item');
  const [filterCat, setFilterCat] = useState<string>('');
  const [lineMetric, setLineMetric] = useState<'sold' | 'gross' | 'broken' | 'remit'>('sold');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const L2 = (th: string, en: string) => (lang === 'en' ? en : th);
  const anchor = viewDay || shift.date;
  const spanN = ({ '1': 1, '7': 7, '30': 30 }[span] || 1) as number;
  const isLive = anchor === shift.date && spanN === 1;
  const winN = ct === 'line' ? (span === '7' ? 7 : 30) : spanN;

  const dshort = (s: string) =>
    new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'short',
    }).format(new Date(s + 'T12:00:00+07:00'));

  const wdName = (s: string) =>
    new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', {
      timeZone: 'Asia/Bangkok',
      weekday: 'long',
    }).format(new Date(s + 'T12:00:00+07:00'));

  const dayState = (d: string) => {
    if (d === shift.date) return 'live';
    if (d > shift.date) return 'future';
    const r = (daily || []).find((x) => x.date === d);
    return r ? (r.sample ? 'sample' : 'closed') : 'none';
  };

  const winStats = () => {
    let have = 0;
    let sample = 0;
    let live = 0;
    for (let i = 0; i < winN; i++) {
      const st = dayState(shiftDay(anchor, -i));
      if (st === 'live') {
        have++;
        live = 1;
      } else if (st === 'closed') {
        have++;
      } else if (st === 'sample') {
        have++;
        sample++;
      }
    }
    return {
      n: winN,
      have,
      sample,
      live,
      a: anchor,
      st: shiftDay(anchor, -(winN - 1)),
    };
  };

  const stepDay = (delta: number) => {
    const target = shiftDay(anchor, delta);
    if (target > shift.date) return;
    setViewDay(target === shift.date ? null : target);
    setSelectedKey(null);
  };

  const catL = (k: string) => {
    const it = items.find((o) => o.cat === k && o.catEn);
    return lang === 'en' && it && it.catEn ? it.catEn : k;
  };

  const allCalcItems = liveItems.map((o) => ({ ...o, ...calc(o) }));
  const snackItems = allCalcItems.filter((o) => o.kind !== 'material');

  const soldTotal = snackItems.reduce((a, o) => a + N(o.sold), 0);
  const issList = allCalcItems.filter((o) => o.diff !== 0 || o.net < 0);
  const netTotal = snackItems.reduce((a, o) => a + o.net, 0);

  const fin = calculateFinanceMetrics({
    anchorDate: anchor,
    spanDays: spanN,
    shiftDate: shift.date,
    liveItems,
    saleLines,
    dailyRecords: daily,
    variances,
  });

  const pv = (variances || []).filter((v) => v.status === 'pending');

  const renderDateControl = () => {
    const live = anchor === shift.date;
    const isLine = ct === 'line';
    const opts: [string, string][] = isLine
      ? [
          ['7', L2('7 วัน', '7 days')],
          ['30', L2('30 วัน', '30 days')],
        ]
      : [
          ['1', L2('วันเดียว', '1 day')],
          ['7', L2('7 วัน', '7 days')],
          ['30', L2('30 วัน', '30 days')],
        ];
    const cur = isLine ? (span === '7' ? '7' : '30') : span;
    const stt = winStats();
    const single = !isLine && stt.n === 1;

    let cls = 'none';
    let ic = 'info';
    let msg = '';
    let sub = '';

    if (single) {
      const d = dayState(anchor);
      if (d === 'live') {
        cls = 'warn';
        ic = 'live';
        msg = L2(
          'ยังไม่ปิดยอด · แสดงข้อมูลสดของกะปัจจุบัน',
          'Shift not closed · showing live data'
        );
      } else if (d === 'closed') {
        const rec = (daily || []).find((x) => x.date === anchor);
        const counterTxt =
          rec && rec.counterName
            ? ` · ${L2('ผู้ตรวจนับ', 'Counted by')} ${rec.counterName}${
                rec.counterTitle ? ` (${rec.counterTitle})` : ''
              }`
            : '';
        cls = 'ok';
        ic = 'check';
        msg = L2('ปิดยอดแล้ว · ข้อมูลจากวันที่ปิดยอด', 'Closed · data from the closing record') + counterTxt;
      } else if (d === 'sample') {
        cls = 'warn';
        ic = 'alert';
        msg = L2('ข้อมูลจำลอง · ไม่ใช่ยอดจริง', 'Simulated data · not real figures');
      } else {
        cls = 'none';
        ic = 'info';
        msg = L2(
          'ไม่มีบันทึกของวันที่เลือก · ไม่เคยปิดยอดวันนั้น',
          'No record for this day · it was never closed'
        );
      }
    } else {
      const rg = dshort(stt.st) + ' – ' + dshort(stt.a);
      cls = stt.have === 0 ? 'none' : stt.sample || stt.live ? 'warn' : 'ok';
      ic = stt.have === 0 ? 'info' : cls === 'ok' ? 'check' : 'alert';
      msg = L2(
        `มีข้อมูล ${stt.have} จาก ${stt.n} วัน (${rg})`,
        `Data for ${stt.have} of ${stt.n} days (${rg})`
      );
      const x: string[] = [];
      if (stt.live) x.push(L2('รวมข้อมูลสดของวันนี้', 'includes live data for today'));
      if (stt.sample)
        x.push(L2(`มีข้อมูลจำลอง ${stt.sample} วัน`, `${stt.sample} simulated day(s)`));
      sub = x.join(' · ');
    }

    if (!live && !isLine) {
      const n = L2(
        'ย้อนหลังดูได้เฉพาะยอดขายตามหมวด',
        'Past days show sales by category only'
      );
      sub = sub ? sub + ' · ' + n : n;
    }

    return (
      <div className="dctl">
        <div className="dnav">
          <button
            type="button"
            className="dstep"
            aria-label={L2('วันก่อนหน้า', 'Previous day')}
            onClick={() => stepDay(-1)}
          >
            <Icon name="chl" size={20} />
          </button>
          <button
            type="button"
            className="dmain"
            aria-haspopup="dialog"
            onClick={() =>
              onOpenCalendar(anchor, winN, (picked) => {
                setViewDay(picked === shift.date ? null : picked);
                setSelectedKey(null);
              })
            }
          >
            <span className="dico">
              <Icon name="cal" size={20} />
            </span>
            <span className="dtxt">
              <b>{dmy(anchor)}</b>
              <small>
                {wdName(anchor)}
                {live ? ' · ' + L2('วันนี้', 'Today') : ''}
              </small>
            </span>
          </button>
          <button
            type="button"
            className="dstep"
            disabled={live}
            aria-label={L2('วันถัดไป', 'Next day')}
            onClick={() => stepDay(1)}
          >
            <Icon name="chr" size={20} />
          </button>
        </div>

        <div
          className="dseg"
          style={{ ['--n' as string]: opts.length }}
          role="group"
          aria-label={L2('ช่วงเวลา', 'Range')}
        >
          {opts.map(([k, l]) => (
            <button
              type="button"
              key={k}
              aria-pressed={cur === k}
              onClick={() => {
                setSpan(k as '1' | '7' | '30');
                setSelectedKey(null);
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <div className={`dstat ${cls}`} role="status">
          <span className="st">
            {ic === 'live' ? <i className="ldot" /> : <Icon name={ic} size={16} />}
            <span>
              {msg}
              {sub ? <small>{sub}</small> : null}
            </span>
          </span>
          {!live && (
            <button
              type="button"
              className="dnow"
              onClick={() => {
                setViewDay(null);
                setSelectedKey(null);
              }}
            >
              {L2('กลับวันนี้', 'Back to today')}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderLineChartSection = () => {
    const exp = shift.expenses.reduce((a, e) => a + N(e.amt), 0);
    const cats: Record<string, number> = {};
    liveItems.forEach((o) => {
      const k = o.cat || 'ไม่ระบุหมวด';
      cats[k] = (cats[k] || 0) + N(o.sold);
    });
    const todayRec: DailyRecord & { live?: boolean } = {
      date: shift.date,
      closed: false,
      sold: liveItems.reduce((a, o) => a + N(o.sold), 0),
      gross: N(shift.cash) + N(shift.qr),
      cash: N(shift.cash),
      qr: N(shift.qr),
      exp,
      remit: N(shift.cash) - exp,
      broken: liveItems.reduce((a, o) => a + N(o.broken), 0),
      cats,
      nets: {},
      live: true,
    };

    const pts = [...(daily || []).filter((d) => d.date !== shift.date), todayRec].sort((a, b) =>
      a.date < b.date ? -1 : 1
    );
    const endD = anchor;
    const startD = shiftDay(endD, -(winN - 1));
    const ptsR = pts.filter((p) => p.date >= startD && p.date <= endD);

    const LM: Record<'sold' | 'gross' | 'broken' | 'remit', string> = {
      sold: t('ขาย (ชิ้น)'),
      gross: t('ยอดขายรวม (บาท)'),
      broken: t('ของเสีย (ชิ้น)'),
      remit: t('เงินสดนำส่งสุทธิ (บาท)'),
    };

    const W = 360;
    const H = 290;
    const L0 = 48;
    const R = 16;
    const T = 28;
    const B = 44;
    const vs = ptsR.map((p) => N(p[lineMetric]));
    const mn = Math.min(0, ...vs);
    const mx = Math.max(...vs, 1);
    const y = (v: number) => T + ((mx - v) / (mx - mn || 1)) * (H - T - B);
    const x = (i: number) => L0 + (i * (W - L0 - R)) / Math.max(1, ptsR.length - 1);

    let dPath = '';
    ptsR.forEach((p, i) => {
      const gap = i > 0 && Date.parse(p.date) - Date.parse(ptsR[i - 1].date) > 864e5 * 1.5;
      dPath += (i === 0 || gap ? 'M' : 'L') + x(i) + ' ' + y(vs[i]) + ' ';
    });

    const sp = (W - L0 - R) / Math.max(1, ptsR.length - 1);
    const stV = Math.max(1, Math.ceil(30 / sp));
    const stX = Math.max(1, Math.ceil(36 / sp));
    const iMax = vs.indexOf(Math.max(...vs));
    const iMin = vs.indexOf(Math.min(...vs));
    const iSel = ptsR.findIndex((q) => q.date === selectedKey);
    const keyIndices = [iMax, iMin, iSel].filter((k) => k >= 0);
    const showV = (i: number) =>
      keyIndices.includes(i) || (i % stV === 0 && keyIndices.every((k) => Math.abs(k - i) >= stV));
    const showX = (i: number) =>
      i === iSel || (i % stX === 0 && (iSel < 0 || Math.abs(iSel - i) >= stX));

    const pickedPt = ptsR.find((q) => q.date === selectedKey);

    return (
      <>
        <div className="card" style={{ padding: 14, marginTop: 22 }}>
          <div className="row" role="group" aria-label={t('ชนิดกราฟ')}>
            {(['bar', 'donut', 'line'] as const).map((k) => (
              <button
                type="button"
                key={k}
                className="chip"
                aria-pressed={ct === k}
                onClick={() => {
                  setCt(k);
                  setSelectedKey(null);
                }}
              >
                {t({ bar: 'แท่ง', donut: 'โดนัท', line: 'เส้น' }[k])}
              </button>
            ))}
          </div>

          {renderDateControl()}

          <div className="row" style={{ marginTop: 10 }}>
            <div className="grow">
              <label htmlFor="l-sel">{t('ดูค่า')}</label>
              <select
                id="l-sel"
                value={lineMetric}
                onChange={(e) => {
                  setLineMetric(e.target.value as 'sold' | 'gross' | 'broken' | 'remit');
                  setSelectedKey(null);
                }}
              >
                {Object.entries(LM).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h2 style={{ margin: '14px 0 4px' }}>
            {t('แนวโน้มรายวัน')}: {LM[lineMetric]}
          </h2>

          {ptsR.length < 2 ? (
            <div className="empty">
              {L2(
                `ช่วง ${winN} วันนี้มีข้อมูลเพียง ${ptsR.length} วัน ต้องมีอย่างน้อย 2 วันจึงจะแสดงกราฟเส้น · ลองเลือกวันที่หรือช่วงอื่น`,
                `This ${winN}-day window has data for only ${ptsR.length} day(s). At least 2 days are needed for the line chart.`
              )}
            </div>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                role="group"
                aria-label={t('กราฟเส้น')}
                style={{ color: 'var(--ink)', maxWidth: 640, display: 'block', margin: 'auto' }}
              >
                {[0, 1, 2, 3, 4].map((k) => {
                  const v = mn + ((mx - mn) * k) / 4;
                  return (
                    <g key={k}>
                      <line
                        x1={L0}
                        x2={W - R}
                        y1={y(v)}
                        y2={y(v)}
                        stroke="currentColor"
                        opacity="0.15"
                      />
                      <text
                        x={L0 - 6}
                        y={y(v) + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="currentColor"
                        opacity="0.7"
                      >
                        {fmt(Math.round(v))}
                      </text>
                    </g>
                  );
                })}
                <path
                  className="ln"
                  pathLength={1}
                  d={dPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {ptsR.map((p, i) => {
                  const sel = selectedKey === p.date;
                  return (
                    <g
                      key={p.date}
                      className="dt"
                      tabIndex={0}
                      role="button"
                      aria-label={`${p.date} ${LM[lineMetric]} ${fmt(vs[i])}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedKey(sel ? null : p.date)}
                    >
                      <circle
                        cx={x(i)}
                        cy={y(vs[i])}
                        r={Math.max(8, Math.min(20, sp / 2))}
                        fill="transparent"
                      />
                      {p.date === endD && (
                        <circle
                          cx={x(i)}
                          cy={y(vs[i])}
                          r={8}
                          fill="none"
                          stroke="var(--sel)"
                          strokeWidth="1.5"
                          opacity="0.6"
                        />
                      )}
                      <circle
                        cx={x(i)}
                        cy={y(vs[i])}
                        r={sel ? 5 : 3}
                        fill={sel ? 'var(--sel)' : 'currentColor'}
                      />
                      {showV(i) && (
                        <text
                          x={x(i)}
                          y={y(vs[i]) - 9}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight={sel ? 700 : 500}
                          fill="currentColor"
                        >
                          {fmt(vs[i])}
                        </text>
                      )}
                      {showX(i) && (
                        <text
                          x={x(i)}
                          y={H - B + 16}
                          textAnchor="middle"
                          fontSize="9"
                          fill="currentColor"
                          opacity="0.7"
                        >
                          {dshort(p.date)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              <p className="hint">
                1 {t('จุด =')} {LM[lineMetric]}{' '}
                {t('ของ 1 วัน · จุดสีน้ำเงิน = วันที่เลือก · วันที่ไม่มีข้อมูลจะเว้นช่วง ไม่เชื่อมเส้น')}
              </p>
            </>
          )}
        </div>

        {pickedPt ? (
          <div className="card" id="det">
            <div className="top">
              <b>{dmy(pickedPt.date)}</b>
              <span
                className={`pill ${
                  (pickedPt as { live?: boolean }).live || pickedPt.sample ? 'warn' : 'ok'
                }`}
              >
                {(pickedPt as { live?: boolean }).live
                  ? t('กะปัจจุบัน (ข้อมูลสด)')
                  : pickedPt.sample
                  ? t('ข้อมูลจำลอง')
                  : L2('ปิดยอดแล้ว', 'Closed')}
              </span>
            </div>
            <table>
              <tbody>
                <tr>
                  <td>{t('ขาย')}</td>
                  <td>
                    {fmt(pickedPt.sold)} {t('ชิ้น')}
                  </td>
                </tr>
                <tr>
                  <td>{t('ของเสีย')}</td>
                  <td>
                    {fmt(pickedPt.broken)} {t('ชิ้น')}
                  </td>
                </tr>
                <tr>
                  <td>{t('เงินสด')}</td>
                  <td>{baht(pickedPt.cash)}</td>
                </tr>
                <tr>
                  <td>{t('โอน/สแกน')}</td>
                  <td>{baht(pickedPt.qr)}</td>
                </tr>
                <tr>
                  <td>
                    <b>{t('ยอดขายรวม')}</b>
                  </td>
                  <td>
                    <b>{baht(pickedPt.gross)}</b>
                  </td>
                </tr>
                <tr>
                  <td>{t('ค่าใช้จ่าย')}</td>
                  <td>− {baht(pickedPt.exp)}</td>
                </tr>
                <tr>
                  <td>
                    <b>{t('เงินสดนำส่งสุทธิ')}</b>
                  </td>
                  <td>
                    <b>{baht(pickedPt.remit)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint" id="det">
            {t('แตะจุดบนเส้นเพื่อดูรายละเอียดของวันนั้น')}
          </p>
        )}

        <details>
          <summary>{t('ดูข้อมูลกราฟเป็นตาราง')}</summary>
          <div className="card scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('วันที่')}</th>
                  <th>{LM[lineMetric]}</th>
                </tr>
              </thead>
              <tbody>
                {ptsR.map((q, i) => (
                  <tr key={q.date}>
                    <td>{dmy(q.date)}</td>
                    <td>{fmt(vs[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </>
    );
  };

  const renderBarOrDonutSection = () => {
    const hist = !isLive;
    const M = hist ? 'sold' : metric;
    const G = hist ? 'cat' : groupBy;
    const ML: Record<'sold' | 'net' | 'actual' | 'broken' | 'diff', string> = {
      sold: t('ขาย'),
      net: t('คงเหลือสุทธิ'),
      actual: t('นับจริง'),
      broken: t('ของเสีย'),
      diff: t('ผลต่างจากยอดยกเข้า'),
    };
    const V = (o: StockItem & { open: number; net: number; diff: number }) =>
      ({
        sold: N(o.sold),
        net: o.net,
        actual: N(o.actual),
        broken: N(o.broken),
        diff: o.diff,
      }[M]);

    const catOf = (o: StockItem) => o.cat || 'ไม่ระบุหมวด';
    const cg: Record<
      string,
      { k: string; n: string; v: number; items: (StockItem & { open: number; net: number; diff: number })[] }
    > = {};
    snackItems.forEach((o) => {
      const k = catOf(o);
      if (!cg[k]) cg[k] = { k, n: k, v: 0, items: [] };
      cg[k].v += V(o);
      cg[k].items.push(o);
    });

    const histCats = () => {
      const st = shiftDay(anchor, -(spanN - 1));
      const hc: Record<string, number> = {};
      (daily || []).forEach((d) => {
        if (d.date === shift.date || d.date < st || d.date > anchor) return;
        Object.entries(d.cats || {}).forEach(([k, v]) => {
          hc[k] = (hc[k] || 0) + N(v);
        });
      });
      if (anchor >= shift.date) {
        snackItems.forEach((o) => {
          const k = o._cat || o.cat || 'ไม่ระบุหมวด';
          hc[k] = (hc[k] || 0) + N(o.sold);
        });
      }
      return hc;
    };

    const hc = hist ? histCats() : null;
    const cats = hc
      ? Object.entries(hc)
          .map(([k, v]) => ({ k, n: catL(k), v, items: [] }))
          .sort((a, b) => b.v - a.v)
      : Object.values(cg).sort((a, b) => b.v - a.v);

    const fcO: Record<string, string> = {};
    snackItems.forEach((o) => {
      const k = o._cat || o.cat || '';
      if (k && !(k in fcO)) fcO[k] = o.cat;
    });

    const Lf =
      ct === 'bar' && G === 'item' && filterCat
        ? snackItems.filter((o) => (o._cat || o.cat) === filterCat)
        : snackItems;

    const allRows =
      G === 'cat'
        ? cats
        : Lf.map((o) => ({ k: o.code, n: o.name, v: V(o), items: [o] })).sort((a, b) => b.v - a.v);

    const total = allRows.length;
    const rows = G === 'item' && !showAll ? allRows.slice(0, 15) : allRows;
    const mxa = Math.max(1, ...rows.map((r) => Math.abs(r.v)));

    const posCats = cats.filter((c) => c.v > 0);
    const posTot = posCats.reduce((a, c) => a + c.v, 0);
    const C = 2 * Math.PI * 36;
    let donutOff = 0;

    return (
      <>
        <div className="card" style={{ padding: 14, marginTop: 22 }}>
          <div className="row" role="group" aria-label={t('ชนิดกราฟ')}>
            {(['bar', 'donut', 'line'] as const).map((k) => (
              <button
                type="button"
                key={k}
                className="chip"
                aria-pressed={ct === k}
                onClick={() => {
                  setCt(k);
                  setSelectedKey(null);
                }}
              >
                {t({ bar: 'แท่ง', donut: 'โดนัท', line: 'เส้น' }[k])}
              </button>
            ))}
          </div>

          {renderDateControl()}

          <div className="row" style={{ marginTop: 10 }}>
            <div className="grow">
              <label htmlFor="m-sel">{t('ดูค่า')}</label>
              <select
                id="m-sel"
                value={M}
                onChange={(e) => {
                  setMetric(e.target.value as 'sold' | 'net' | 'actual' | 'broken' | 'diff');
                  setSelectedKey(null);
                }}
              >
                {Object.entries(hist ? { sold: ML.sold } : ML).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {ct === 'bar' && (
              <div className="grow">
                <label htmlFor="g-sel">{t('จัดกลุ่ม')}</label>
                <select
                  id="g-sel"
                  value={G}
                  onChange={(e) => {
                    setGroupBy(e.target.value as 'item' | 'cat');
                    setSelectedKey(null);
                  }}
                >
                  {Object.entries(
                    hist ? { cat: t('ตามหมวด') } : { item: t('ตามสินค้า'), cat: t('ตามหมวด') }
                  ).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {ct === 'bar' && G === 'item' && (
              <div className="grow">
                <label htmlFor="f-sel">{t('กรองหมวด')}</label>
                <select
                  id="f-sel"
                  value={filterCat}
                  onChange={(e) => {
                    setFilterCat(e.target.value);
                    setSelectedKey(null);
                    setShowAll(false);
                  }}
                >
                  <option value="">{t('ทั้งหมด')}</option>
                  {Object.entries(fcO).map(([k, l]) => (
                    <option key={k} value={k}>
                      {t(l)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <h2 style={{ margin: '14px 0 4px' }}>
            {ML[M]} {ct === 'donut' || G === 'cat' ? t('ตามหมวด') : t('ตามสินค้า')} ({t('ชิ้น')})
          </h2>

          {ct === 'bar' ? (
            <>
              <div className="hbars" id="chs">
                {rows.map((r) => {
                  const sel = selectedKey === r.k;
                  const w = Math.max(1.5, (Math.abs(r.v) / mxa) * 100);
                  return (
                    <button
                      type="button"
                      key={r.k}
                      className={`hb${sel ? ' on' : ''}${selectedKey && !sel ? ' dim' : ''}`}
                      onClick={() => setSelectedKey(sel ? null : r.k)}
                    >
                      <span className="hn">{t(r.n)}</span>
                      <span className="ht">
                        <i
                          className={r.v < 0 ? 'neg' : M === 'diff' && r.v > 0 ? 'pos' : ''}
                          style={{ width: `${w}%` }}
                        />
                      </span>
                      <b
                        style={{
                          color:
                            M === 'diff'
                              ? r.v < 0
                                ? 'var(--bad)'
                                : r.v > 0
                                ? 'var(--plus)'
                                : 'inherit'
                              : 'inherit',
                        }}
                      >
                        {M === 'diff' && r.v > 0 ? '+' : ''}
                        {fmt(r.v)}
                      </b>
                    </button>
                  );
                })}
              </div>
              <p className="hint">
                {G === 'cat'
                  ? t(
                      'แต่ละแถว = หมวดหนึ่งหมวด · แท่งแดง = ค่าติดลบ · แท่งสีน้ำเงิน = ที่เลือกอยู่'
                    )
                  : t(
                      'แต่ละแถว = สินค้าหนึ่งรายการ · แท่งแดง = ค่าติดลบ · แท่งสีน้ำเงิน = ที่เลือกอยู่'
                    )}
                {G === 'item' && total > 15
                  ? ` · ${t('แสดง')} ${rows.length} ${t('จาก')} ${total} ${t('รายการ')}`
                  : ''}
              </p>
              {G === 'item' && total > 15 && (
                <button type="button" onClick={() => setShowAll((v) => !v)}>
                  {showAll
                    ? t('แสดงเฉพาะ 15 อันดับแรก')
                    : `${t('แสดงทั้งหมด')} ${total} ${t('รายการ')}`}
                </button>
              )}
            </>
          ) : !posTot ? (
            <div className="empty">{t('ไม่มีค่าบวกให้แสดงสัดส่วน ลองเปลี่ยนตัวเลือก "ดูค่า"')}</div>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'center' }}>
                <svg
                  viewBox="0 0 100 100"
                  width="260"
                  height="260"
                  role="group"
                  aria-label={t('กราฟโดนัทตามหมวด')}
                >
                  <g className="dg">
                    <g transform="rotate(-90 50 50)">
                      {posCats.map((c, i) => {
                        const len = (c.v / posTot) * C;
                        const curOff = donutOff;
                        donutOff += len;
                        return (
                          <circle
                            key={c.k}
                            tabIndex={0}
                            role="button"
                            aria-label={`${c.k} ${fmt(c.v)} ชิ้น`}
                            cx="50"
                            cy="50"
                            r="36"
                            fill="none"
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={selectedKey === c.k ? 14 : 9}
                            strokeDasharray={`${len} ${C - len}`}
                            strokeDashoffset={-curOff}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedKey(selectedKey === c.k ? null : c.k)}
                          />
                        );
                      })}
                    </g>
                  </g>
                  <text
                    x="50"
                    y="49"
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="currentColor"
                  >
                    {fmt(posTot)}
                  </text>
                  <text
                    x="50"
                    y="60"
                    textAnchor="middle"
                    fontSize="5"
                    fill="currentColor"
                    opacity="0.7"
                  >
                    {t('ชิ้น')}
                  </text>
                </svg>
                <div className="legend grow">
                  {posCats.map((c, i) => (
                    <button
                      type="button"
                      key={c.k}
                      aria-pressed={selectedKey === c.k}
                      onClick={() => setSelectedKey(selectedKey === c.k ? null : c.k)}
                    >
                      <em style={{ background: COLORS[i % COLORS.length] }} />
                      {t(c.n || c.k)} · {fmt(c.v)} {t('ชิ้น')} ({Math.round((c.v / posTot) * 100)}%)
                    </button>
                  ))}
                </div>
              </div>
              <p className="hint">
                1{' '}
                {t(
                  'ส่วนของวง = สัดส่วนของหมวดหนึ่ง (นับเฉพาะค่าบวก) · กดส่วนของวงหรือรายการด้านข้างเพื่อดูรายละเอียด'
                )}
              </p>
            </>
          )}
        </div>

        <div id="det">
          {!selectedKey ? (
            <p className="hint">{t('แตะแท่ง (หรือส่วนของวง) เพื่อดูรายละเอียดทั้งหมด')}</p>
          ) : ct === 'donut' || G === 'cat' ? (
            cg[selectedKey] ? (
              <div className="card">
                <div className="top">
                  <b>
                    {t('หมวด')} {t(selectedKey)}
                  </b>
                  <span className="code">
                    {cg[selectedKey].items.length} {t('รายการ')}
                  </span>
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td>{t('ยอดยกเข้ารวม')}</td>
                      <td>
                        {fmt(cg[selectedKey].items.reduce((a, o) => a + N(o.carry), 0))} {t('ชิ้น')}
                      </td>
                    </tr>
                    <tr>
                      <td>{t('นับจริงรวม')}</td>
                      <td>
                        {fmt(cg[selectedKey].items.reduce((a, o) => a + N(o.actual), 0))} {t('ชิ้น')}
                      </td>
                    </tr>
                    <tr>
                      <td>{t('ขายรวม')}</td>
                      <td>
                        {fmt(cg[selectedKey].items.reduce((a, o) => a + N(o.sold), 0))} {t('ชิ้น')}
                      </td>
                    </tr>
                    <tr>
                      <td>{t('ของเสียรวม')}</td>
                      <td>
                        {fmt(cg[selectedKey].items.reduce((a, o) => a + N(o.broken), 0))} {t('ชิ้น')}
                      </td>
                    </tr>
                    <tr>
                      <td>{t('คงเหลือสุทธิรวม')}</td>
                      <td>
                        {fmt(cg[selectedKey].items.reduce((a, o) => a + N(o.net), 0))} {t('ชิ้น')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null
          ) : (
            (() => {
              const o = snackItems.find((x) => x.code === selectedKey);
              if (!o) return null;
              return (
                <div className="card">
                  <div className="top">
                    <b>{o.name}</b>
                    <StatusPill item={o} t={t} />
                    <span className="code">
                      {t('รหัส')} {o.code}
                    </span>
                  </div>
                  <p className="hint">
                    {t('หมวด')} {t(catOf(o))}
                  </p>
                  <table>
                    <tbody>
                      <tr>
                        <td>{t('ยอดยกเข้า')}</td>
                        <td>
                          {fmt(o.carry)} {t('ชิ้น')}
                        </td>
                      </tr>
                      <tr>
                        <td>{t('นับจริง')}</td>
                        <td>
                          {fmt(o.actual)} {t('ชิ้น')}
                        </td>
                      </tr>
                      <tr>
                        <td>{t('ขาย')}</td>
                        <td>
                          {fmt(o.sold)} {t('ชิ้น')}
                        </td>
                      </tr>
                      <tr>
                        <td>{t('ของเสีย')}</td>
                        <td>
                          {fmt(o.broken)} {t('ชิ้น')}
                        </td>
                      </tr>
                      <tr>
                        <td>{t('คงเหลือสุทธิ')}</td>
                        <td>
                          {fmt(o.net)} {t('ชิ้น')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </div>

        <h2>
          {t('รายการที่ต้องตรวจ')} ({issList.length})
        </h2>
        {issList.length ? (
          <div className="card scroll">
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
                {issList.map((o) => (
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
          <div className="empty">{t('ไม่มีผลต่าง ยอดตรงทุกรายการ')}</div>
        )}

        <details>
          <summary>{t('ดูข้อมูลกราฟเป็นตาราง')}</summary>
          <div className="card scroll">
            <table>
              <thead>
                <tr>
                  <th>{G === 'cat' || ct === 'donut' ? t('หมวด') : t('สินค้า')}</th>
                  <th>
                    {ML[M]} ({t('ชิ้น')})
                  </th>
                </tr>
              </thead>
              <tbody>
                {(ct === 'donut' ? cats : rows).map((r) => (
                  <tr key={r.k}>
                    <td>{t(r.n)}</td>
                    <td>{fmt(r.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </>
    );
  };

  return (
    <div>
      {pv.length > 0 && (
        <div className="dstat warn" style={{ marginBottom: 10 }}>
          <span className="st">
            <Icon name="alert" size={16} />
            <span>
              {t('ผลต่างค้างจากกะก่อน')} {pv.length} {t('รายการ · รอตรวจสอบ')}
            </span>
          </span>
          <button type="button" className="dnow" onClick={onOpenVariances}>
            {t('ดูและปิดประเด็น')}
          </button>
        </div>
      )}

      <div className="finrow">
        <div className="finl">
          <div className="grid-2">
            <div className="box">
              <small>
                <Icon name="stock" size={15} />
                {L2('รายการทั้งหมด', 'Total items')}
              </small>
              <b>{snackItems.length}</b>
            </div>
            <div className="box">
              <small>
                <Icon name="report" size={15} />
                {L2('ขายแล้ว (ชิ้น)', 'Sold (pcs)')}
              </small>
              <b>{fmt(soldTotal)}</b>
            </div>
            <div className="box">
              <small>
                <Icon name="alert" size={15} />
                {L2('รายการที่มีผลต่าง', 'Items with variance')}
              </small>
              <b>{issList.length}</b>
            </div>
            <div className="box inv">
              <small>
                <Icon name="check" size={15} />
                {L2('คงเหลือสุทธิ (ชิ้น)', 'Net stock (pcs)')}
              </small>
              <b>{fmt(netTotal)}</b>
            </div>
          </div>
        </div>

        <div className="finr">
          <div className="card finc">
            <div className="top">
              <b>{L2('กราฟมูลค่าสินค้าและกำไร', 'Profit and stock value')}</b>
              <span className="code">
                {dmy(fin.days[fin.n - 1])}
                {fin.n > 1 ? ' – ' + dmy(fin.a) : ''}
              </span>
            </div>
            {fin.none ? (
              <div className="empty">
                {L2(
                  'ยังไม่มีข้อมูลการขายหรือต้นทุนในช่วงนี้',
                  'No sales or cost data in this period yet'
                )}
              </div>
            ) : (
              <>
                <div className="frow" style={{ marginTop: 12, border: 0 }}>
                  <span style={{ color: '#1f9d6b' }}>
                    {L2('กำไร', 'Profit')} {baht(fin.profit)}
                  </span>
                  <span style={{ color: '#d98a1a' }}>
                    {L2('ยอดขาดคาดการณ์', 'Expected shortfall')} {baht(fin.exp)}
                  </span>
                </div>
                <div className="fbar">
                  <i style={{ width: `${fin.gp}%`, background: '#1f9d6b' }} />
                  <i style={{ width: `${100 - fin.gp}%`, background: '#e0a030' }} />
                </div>
                <p className="hint">
                  {L2('เขียว = กำไร', 'Green = profit')} ·{' '}
                  {L2(
                    'เหลือง = ยอดขาดคาดการณ์ที่รอตรวจสอบ',
                    'Yellow = expected shortfall awaiting review'
                  )}
                </p>
                <div className="frow">
                  <span>
                    <i className="fdot" style={{ background: '#57534e' }} />
                    {L2('ยอดขาย', 'Sales')}
                  </span>
                  <b>{baht(fin.rev)}</b>
                </div>
                <div className="frow">
                  <span>
                    <i className="fdot" style={{ background: '#57534e' }} />
                    {L2('ต้นทุนสินค้าที่ขาย', 'Cost of goods sold')}
                  </span>
                  <b>{baht(fin.cogs)}</b>
                </div>
                <div className="frow">
                  <span>
                    <i className="fdot" style={{ background: '#c0392b' }} />
                    {L2('ยอดเสียจริง', 'Confirmed loss')}
                  </span>
                  <b>{baht(fin.conf)}</b>
                </div>
                {fin.noCost > 0 && (
                  <p className="hint" style={{ color: 'var(--acc)' }}>
                    {L2(
                      `มียอดขาย ${fin.noCost} รายการที่ไม่มีต้นทุน กำไรอาจสูงเกินจริง · กรอกต้นทุนในรายละเอียดสินค้า`,
                      `${fin.noCost} sales lines have no cost, so profit may be overstated. Enter costs in item details.`
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {ct === 'line' ? renderLineChartSection() : renderBarOrDonutSection()}
    </div>
  );
};
