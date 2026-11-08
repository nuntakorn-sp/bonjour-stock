import React, { useState } from 'react';
import { ShiftData, SaleLine } from '../types';
import { N, baht, calculateCashSummary } from '../utils/calculations';

interface CashViewProps {
  shift: ShiftData;
  saleLines: SaleLine[];
  dmy: (s: string) => string;
  onOpenMoneyPad: (params: {
    label: string;
    isInt: boolean;
    value: string;
    onCommit: (val: string) => void;
  }) => void;
  onUpdateShiftField: (field: keyof ShiftData, val: number | null) => void;
  onAddExpense: (label: string, amt: number) => void;
  onDeleteExpense: (id: string) => void;
  t: (s: string) => string;
}

export const CashView: React.FC<CashViewProps> = ({
  shift,
  saleLines,
  dmy,
  onOpenMoneyPad,
  onUpdateShiftField,
  onAddExpense,
  onDeleteExpense,
  t,
}) => {
  const [expLabel, setExpLabel] = useState('');
  const [expAmt, setExpAmt] = useState('');
  const [expErr, setExpErr] = useState('');

  const { exp, gross, remit, sysSales, dif, posMatches, floatEnd } = calculateCashSummary(
    shift,
    saleLines
  );
  const locked = shift.locked;

  const renderShiftNumField = (
    key: 'cash' | 'qr' | 'pos' | 'float' | 'floatEnd',
    label: string,
    val: number | null | undefined
  ) => {
    const strVal = val === null || val === undefined ? '' : String(val);
    return (
      <div className="grow">
        <label htmlFor={`f-${key}`}>
          {t(label)} ({t('บาท')})
        </label>
        <input
          type="number"
          inputMode="none"
          min="0"
          step="0.01"
          id={`f-${key}`}
          value={strVal}
          readOnly
          disabled={locked}
          onClick={() => {
            if (locked) return;
            onOpenMoneyPad({
              label: t(label),
              isInt: false,
              value: strVal,
              onCommit: (nextStr) => {
                if (nextStr === '' && key === 'pos') {
                  onUpdateShiftField(key, null);
                } else {
                  onUpdateShiftField(key, nextStr === '' ? 0 : Number(nextStr));
                }
              },
            });
          }}
        />
      </div>
    );
  };

  const renderTargetField = (
    key: 'targetSales' | 'targetCustomers' | 'targetPerBill',
    label: string,
    val: number | null | undefined,
    isInt: boolean
  ) => {
    const strVal = val === null || val === undefined ? '' : String(val);
    return (
      <div className="grow">
        <label htmlFor={`f-${key}`}>{t(label)}</label>
        <input
          type="number"
          inputMode="none"
          min="0"
          step={isInt ? '1' : '0.01'}
          id={`f-${key}`}
          value={strVal}
          readOnly
          disabled={locked}
          onClick={() => {
            if (locked) return;
            onOpenMoneyPad({
              label: t(label).replace(/\s*\((บาท|THB|คน|people)\)/, ''),
              isInt,
              value: strVal,
              onCommit: (nextStr) => {
                onUpdateShiftField(key, nextStr.trim() === '' ? null : Number(nextStr));
              },
            });
          }}
        />
      </div>
    );
  };

  const handleAddExp = () => {
    const l = expLabel.trim();
    const v = Number(expAmt);
    if (!l || !(v > 0)) {
      setExpErr(t('ใส่ชื่อรายการและจำนวนเงินมากกว่า 0'));
      return;
    }
    setExpErr('');
    onAddExpense(l, v);
    setExpLabel('');
    setExpAmt('');
  };

  return (
    <div>
      <h2>{t('เป้าขายรายวัน')}</h2>
      <div className="card">
        <div className="row">
          <div className="grow">
            <label htmlFor="t-date">{t('วันที่')}</label>
            <input type="text" id="t-date" value={dmy(shift.date)} disabled />
          </div>
          {renderTargetField('targetSales', 'เป้ายอดขาย (บาท)', shift.targetSales, false)}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {renderTargetField('targetCustomers', 'เป้าลูกค้า (คน)', shift.targetCustomers, true)}
          {renderTargetField('targetPerBill', 'เป้าต่อบิล (บาท)', shift.targetPerBill, false)}
        </div>
        <p className="hint">{t('ผู้จัดการกรอกเอง เพราะเป้าแต่ละวันไม่เท่ากัน')}</p>
      </div>

      <div className="grid-2">
        <div className="box inv">
          <small>{t('ยอดขายรวม (เงินสด + โอน/สแกน)')}</small>
          <b>{baht(sysSales)}</b>
        </div>
        <div className="box">
          <small>{t('ยอดเงินสดนำส่งสุทธิ')}</small>
          <b>{baht(remit)}</b>
        </div>
      </div>

      <p className="hint">
        {t('นำส่ง = เงินสด − ค่าใช้จ่ายหน้าร้าน (ไม่รวมยอดโอน) · เงินทอนในลิ้นชัก')}{' '}
        {baht(floatEnd)}
      </p>

      <h2>{t('ยอดขายจากระบบ')}</h2>
      <div className="row">
        {renderShiftNumField('cash', 'เงินสด', shift.cash)}
        {renderShiftNumField('qr', 'โอน/สแกน', shift.qr)}
        {renderShiftNumField('pos', 'ยอดตามบิลสรุป', shift.pos)}
        {renderShiftNumField('float', 'เงินทอนตั้งต้น', shift.float)}
        {renderShiftNumField('floatEnd', 'เงินทอนคงเหลือ', floatEnd)}
      </div>

      <p style={{ marginTop: 8 }}>
        {shift.pos === null || shift.pos === undefined ? (
          <span className="pill">{t('ยังไม่กรอกยอดบิลสรุป')}</span>
        ) : posMatches ? (
          <span className="pill ok">✓ {t('ตรงกับบิลสรุป')}</span>
        ) : (
          <span className="pill bad">
            ✗ {t('ต่างจากยอดขายรวม')} {baht(gross - N(shift.pos))}
          </span>
        )}
      </p>

      <p style={{ marginTop: 8 }}>
        {t('ผลต่างจากยอดขายตามระบบ')}{' '}
        {dif === 0 ? (
          <span className="pill ok">✓ {t('ตรงยอด')}</span>
        ) : dif < 0 ? (
          <span className="pill bad">
            {t('ขาด')} −{baht(-dif)}
          </span>
        ) : (
          <span className="pill warn">
            {t('เกิน')} +{baht(dif)}
          </span>
        )}
      </p>

      <div className="row" style={{ marginTop: 18, alignItems: 'stretch' }}>
        <div className="grow">
          <label htmlFor="el">{t('รายการ')}</label>
          <input
            type="text"
            id="el"
            value={expLabel}
            disabled={locked}
            onChange={(e) => setExpLabel(e.target.value)}
          />
        </div>
        <div style={{ width: 130 }}>
          <label htmlFor="ea">{t('จำนวนเงิน')}</label>
          <input
            type="number"
            id="ea"
            min="0.01"
            step="0.01"
            value={expAmt}
            disabled={locked}
            onClick={() => {
              if (locked) return;
              onOpenMoneyPad({
                label: t('จำนวนเงิน'),
                isInt: false,
                value: expAmt,
                onCommit: (val) => setExpAmt(val),
              });
            }}
            onChange={(e) => setExpAmt(e.target.value)}
          />
        </div>
        <div className="addcol">
          <label aria-hidden="true">&nbsp;</label>
          <button type="button" className="pri" disabled={locked} onClick={handleAddExp}>
            {t('เพิ่มค่าใช้จ่าย')}
          </button>
        </div>
      </div>
      {expErr && <div className="errt" id="eerr">{expErr}</div>}

      <h2>
        {t('ค่าใช้จ่ายหน้าร้าน')} ({baht(exp)})
      </h2>
      {shift.expenses.length ? (
        shift.expenses.map((e) => (
          <div key={e.id} className="card row">
            <span className="grow">{e.label}</span>
            <b>{baht(e.amt)}</b>
            <button
              type="button"
              className="danger"
              disabled={locked}
              onClick={() => onDeleteExpense(e.id)}
            >
              {t('ลบ')}
            </button>
          </div>
        ))
      ) : (
        <div className="empty">{t('ยังไม่มีค่าใช้จ่ายในกะนี้')}</div>
      )}
    </div>
  );
};
