import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { StockItem, ReceiptRecord, ReceiptLine } from '../types';
import {
  N,
  fmt,
  matchCatalogItem,
  parseReceivingRows,
  parseReceivingText,
  reconcileExtractedLinesWithCatalog,
} from '../utils/calculations';
import { Icon } from './Icons';

interface ReceiveViewProps {
  items: StockItem[];
  liveItems: StockItem[];
  receipts: ReceiptRecord[];
  dmy: (s: string) => string;
  onSaveReceipt: (params: {
    photo: string | null;
    src: 'photo' | 'sheet' | 'manual';
    fileName?: string | null;
    lines: ReceiptLine[];
    mode?: 'add' | 'set';
  }) => void;
  onOpenPhoto: (src: string | null) => void;
  onToast: (msg: string, isErr?: boolean) => void;
  t: (s: string) => string;
}

export function generateReceiptSvgUrl(r: ReceiptRecord, dmy: (s: string) => string): string {
  if (r && typeof r.photo === 'string' && /^(data:image\/|https?:\/\/)/.test(r.photo)) {
    return r.photo;
  }
  const rows = ((r && r.lines) || []).map(
    (l) => `${l.code ? `[${l.code}] ` : ''}${l.name}  +${N(l.act)} ชิ้น`
  );
  const title = 'ใบรับของ (เพิ่มยอดยกเข้า) ' + (r && r.date ? dmy(r.date) : '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#fbfaf7"/><text x="40" y="70" font-size="28" font-weight="bold" fill="#111">${title}</text><text x="40" y="106" font-size="18" fill="#666">${
    (r && r.date) || ''
  }</text><line x1="40" y1="124" x2="560" y2="124" stroke="#ccc"/>${rows
    .map((txt, i) => `<text x="40" y="${162 + i * 38}" font-size="20" fill="#222">${txt}</text>`)
    .join('')}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export const ReceiveView: React.FC<ReceiveViewProps> = ({
  items,
  receipts,
  dmy,
  onSaveReceipt,
  onOpenPhoto,
  onToast,
  t,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rx, setRx] = useState<{
    photo: string | null;
    lines: ReceiptLine[] | null;
    src?: 'photo' | 'sheet' | 'manual';
    fileName?: string | null;
    rawText?: string | null;
    aiSummary?: string | null;
  }>({
    photo: null,
    lines: null,
  });

  const [aiLoading, setAiLoading] = useState(false);
  const [carryMode, setCarryMode] = useState<'add' | 'set'>('add');
  const [showTextPrompt, setShowTextPrompt] = useState(false);
  const [textInput, setTextInput] = useState('');

  const activeItems = items.filter((o) => !o.deleted);

  const rxFind = (line: { code?: string; name: string }) => {
    return matchCatalogItem(activeItems, line.code, line.name);
  };

  const rxRes = (r: ReceiptLine) => {
    const d = N(r.act) - N(r.doc);
    if (d === 0) {
      return (
        <span className="pill ok">
          <Icon name="check" size={13} /> {t('ตรง')}
        </span>
      );
    }
    if (d < 0) {
      return (
        <span className="pill bad">
          <Icon name="arrowDown" size={13} /> {t('ขาด')} {fmt(-d)}
        </span>
      );
    }
    return (
      <span className="pill plus">
        <Icon name="arrowUp" size={13} /> {t('เกิน')} +{fmt(d)}
      </span>
    );
  };

  const runAiExtraction = async (params: {
    imageDataUrl?: string | null;
    rawText?: string | null;
    fallbackLines?: ReceiptLine[];
    src: 'photo' | 'sheet' | 'manual';
    fileName?: string | null;
  }) => {
    if (params.fallbackLines && params.fallbackLines.length > 0) {
      const matchedCount = params.fallbackLines.filter((l) => rxFind(l)).length;
      setRx({
        photo: params.imageDataUrl || null,
        lines: params.fallbackLines,
        src: params.src,
        fileName: params.fileName || null,
        rawText: params.rawText || null,
        aiSummary: `${t('AI อ่านข้อมูลสำเร็จ')} ${params.fallbackLines.length} ${t(
          'รายการ'
        )} (${t('ตรงกับรายการที่มีอยู่')} ${matchedCount} ${t('รายการ')})`,
      });
    }

    setAiLoading(true);
    try {
      const catalog = activeItems.map((o) => ({
        code: o.code,
        name: o.name,
        nameEn: o.nameEn || '',
        kind: o.kind || 'snack',
        unit: o.unit || 'ชิ้น',
        cat: o.cat || '',
      }));

      // Give the server time to finish (server timeout is 45s). 6s used to kill
      // every photo-based read before Gemini could respond.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 50000);

      let resp: Response;
      try {
        resp = await fetch('/api/ai/read-receive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            imageDataUrl: params.imageDataUrl || null,
            rawText: params.rawText || null,
            catalog,
          }),
        });
      } finally {
        clearTimeout(timer);
      }

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'AI ไม่สามารถอ่านข้อมูลได้');
      }

      const aiItems = Array.isArray(data.items) ? data.items : [];
      const reconciled = reconcileExtractedLinesWithCatalog(aiItems, activeItems);

      if (reconciled.length > 0) {
        const matchedCount = reconciled.filter((l) => rxFind(l)).length;
        setRx({
          photo: params.imageDataUrl || null,
          lines: reconciled,
          src: params.src,
          fileName: params.fileName || null,
          rawText: params.rawText || null,
          aiSummary:
            data.summary ||
            `${t('AI อ่านข้อมูลสำเร็จ')} ${reconciled.length} ${t('รายการ')} (${t(
              'ตรงกับรายการที่มีอยู่'
            )} ${matchedCount} ${t('รายการ')})`,
        });
        onToast(
          `${t('AI อ่านข้อมูลสำเร็จ')} ${reconciled.length} ${t('รายการ')} · ${t(
            'ตรงรายการเดิม'
          )} ${matchedCount} ${t('รายการ')}`
        );
      } else if (params.fallbackLines && params.fallbackLines.length > 0) {
        const matchedCount = params.fallbackLines.filter((l) => rxFind(l)).length;
        setRx({
          photo: params.imageDataUrl || null,
          lines: params.fallbackLines,
          src: params.src,
          fileName: params.fileName || null,
          rawText: params.rawText || null,
          aiSummary: `${t('AI อ่านข้อมูลสำเร็จ')} ${params.fallbackLines.length} ${t(
            'รายการ'
          )} (${t('ตรงกับรายการที่มีอยู่')} ${matchedCount} ${t('รายการ')})`,
        });
        onToast(`${t('AI อ่านข้อมูลสำเร็จ')} ${params.fallbackLines.length} ${t('รายการ')}`);
      } else {
        setRx({
          photo: params.imageDataUrl || null,
          lines: [{ name: '', doc: 0, act: 0 }],
          src: params.src,
          fileName: params.fileName || null,
          rawText: params.rawText || null,
          aiSummary: null,
        });
        onToast(t('ไม่พบรายการสินค้าในรูปหรือไฟล์ กรอกหรือลองรูปอื่นได้'), true);
      }
    } catch (err) {
      if (params.fallbackLines && params.fallbackLines.length > 0) {
        const matchedCount = params.fallbackLines.filter((l) => rxFind(l)).length;
        setRx({
          photo: params.imageDataUrl || null,
          lines: params.fallbackLines,
          src: params.src,
          fileName: params.fileName || null,
          rawText: params.rawText || null,
          aiSummary: `${t('AI อ่านข้อมูลสำเร็จ')} ${params.fallbackLines.length} ${t(
            'รายการ'
          )} (${t('ตรงกับรายการที่มีอยู่')} ${matchedCount} ${t('รายการ')})`,
        });
        onToast(
          `${t('AI อ่านข้อมูลสำเร็จ')} ${params.fallbackLines.length} ${t('รายการ')} · ${t(
            'ตรงรายการเดิม'
          )} ${matchedCount} ${t('รายการ')}`
        );
      } else {
        const msg =
          err instanceof Error && err.name !== 'AbortError'
            ? err.message
            : t('อ่านข้อมูลด้วย AI ไม่สำเร็จ กรอกหรือปรับแก้รายการได้ด้านล่าง');
        onToast(msg, true);
        if (params.imageDataUrl) {
          setRx((prev) => ({
            ...prev,
            photo: params.imageDataUrl || null,
            src: 'photo',
            lines: prev.lines && prev.lines.length ? prev.lines : [{ name: '', doc: 0, act: 0 }],
          }));
        }
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleFile = async (f: File) => {
    if (!f) return;

    // 1. Excel (.xlsx, .xls)
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const allRows: unknown[][] = [];
        const textChunks: string[] = [];
        wb.SheetNames.forEach((sheetName) => {
          const sheet = wb.Sheets[sheetName];
          if (!sheet) return;
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
          rows.forEach((r) => {
            if (Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== '')) {
              allRows.push(r);
              textChunks.push(r.map((c) => String(c ?? '').trim()).join('\t'));
            }
          });
        });
        const localLines = parseReceivingRows(allRows, activeItems);
        const rawText = textChunks.join('\n');
        await runAiExtraction({
          rawText,
          fallbackLines: localLines,
          src: 'sheet',
          fileName: f.name,
        });
      } catch {
        onToast(t('อ่านไฟล์ไม่สำเร็จ'), true);
      }
      return;
    }

    // 2. CSV / TXT / JSON
    if (/\.(csv|txt|tsv|json)$/i.test(f.name) || /^text\//.test(f.type)) {
      try {
        const text = await f.text();
        let localLines: ReceiptLine[] = [];
        if (/\.json$/i.test(f.name)) {
          try {
            const parsedJson = JSON.parse(text);
            const arr = Array.isArray(parsedJson)
              ? parsedJson
              : parsedJson.items || parsedJson.lines || parsedJson.data || [];
            if (Array.isArray(arr)) {
              localLines = reconcileExtractedLinesWithCatalog(
                arr.map((x: Record<string, unknown>) => ({
                  code: String(x.code || x.matchedCode || ''),
                  name: String(x.name || x.product || ''),
                  doc: N(x.doc ?? x.carry ?? x.recv ?? x.qty ?? x.act),
                  act: N(x.act ?? x.carry ?? x.recv ?? x.qty ?? x.doc),
                })),
                activeItems
              );
            }
          } catch {}
        }
        if (!localLines.length) {
          localLines = parseReceivingText(text, activeItems);
        }
        await runAiExtraction({
          rawText: text,
          fallbackLines: localLines,
          src: 'sheet',
          fileName: f.name,
        });
      } catch {
        onToast(t('อ่านไฟล์ไม่สำเร็จ'), true);
      }
      return;
    }

    // 3. Images or PDF
    if (
      !(
        /^image\//.test(f.type) ||
        f.type === 'application/pdf' ||
        /\.(jpe?g|png|gif|webp|heic|heif|bmp|pdf)$/i.test(f.name)
      )
    ) {
      onToast(t('ไม่รองรับไฟล์ชนิดนี้ ใช้รูปหรือไฟล์ .xlsx .xls .csv'), true);
      return;
    }

    const url = await new Promise<string | null>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result));
      reader.onerror = () => res(null);
      reader.readAsDataURL(f);
    });
    if (!url) {
      onToast(t('อ่านไฟล์ไม่สำเร็จ'), true);
      return;
    }

    setRx({
      photo: url.startsWith('data:image/') ? url : null,
      lines: rx.lines,
      src: url.startsWith('data:image/') ? 'photo' : 'sheet',
      fileName: f.name,
    });

    await runAiExtraction({
      imageDataUrl: url,
      src: url.startsWith('data:image/') ? 'photo' : 'sheet',
      fileName: f.name,
    });
  };

  const handleAnalyzeText = async () => {
    const trimmed = textInput.trim();
    if (!trimmed) {
      onToast(t('กรุณาวางหรือพิมพ์ข้อมูลรายการสินค้าก่อน'), true);
      return;
    }
    const localLines = parseReceivingText(trimmed, activeItems);
    setShowTextPrompt(false);
    await runAiExtraction({
      rawText: trimmed,
      fallbackLines: localLines,
      src: 'sheet',
      fileName: 'ข้อมูลข้อความ (AI)',
    });
  };

  const handleSave = () => {
    const rows = (rx.lines || [])
      .map((r) => {
        const matched = rxFind(r);
        return {
          code: matched ? matched.code : r.code,
          name: matched ? matched.name : String(r.name || '').trim(),
          doc: N(r.doc),
          act: N(r.act),
        };
      })
      .filter((r) => r.name);

    if (!rows.length) {
      onToast(t('กรอกชื่อสินค้าอย่างน้อยหนึ่งรายการ'), true);
      return;
    }
    onSaveReceipt({
      photo: rx.photo,
      src: rx.src || 'manual',
      fileName: rx.fileName || null,
      lines: rows,
      mode: carryMode,
    });
    setRx({ photo: null, lines: null });
    setTextInput('');
  };

  const matchedLinesCount = (rx.lines || []).filter((r) => rxFind(r)).length;
  const newLinesCount = (rx.lines || []).filter((r) => r.name && !rxFind(r)).length;
  const totalActQty = (rx.lines || []).reduce((a, r) => a + N(r.act), 0);

  return (
    <div>
      <section
        className="rxup"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          id="rxfile"
          accept="image/*,.xlsx,.xls,.csv,.txt,.pdf,.json"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) handleFile(f);
          }}
        />
        {rx.src === 'sheet' ? (
          <>
            <div className="rxfile" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={18} />
              <b>{rx.fileName || t('ไฟล์ข้อมูล')}</b>
              <span className="pill ok">
                <Icon name="check" size={13} /> {(rx.lines || []).length} {t('รายการ')}
              </span>
            </div>
            <div className="row" style={{ marginTop: 10, justifyContent: 'center' }}>
              {rx.rawText && (
                <button
                  type="button"
                  className="pri"
                  disabled={aiLoading}
                  onClick={() =>
                    runAiExtraction({
                      rawText: rx.rawText,
                      fallbackLines: rx.lines || undefined,
                      src: 'sheet',
                      fileName: rx.fileName,
                    })
                  }
                >
                  {aiLoading ? t('AI กำลังอ่านข้อมูล...') : t('ให้ AI อ่านและจับคู่ใหม่')}
                </button>
              )}
              <button
                type="button"
                disabled={aiLoading}
                onClick={() => setRx({ photo: null, lines: null })}
              >
                <Icon name="close" size={16} />
                {t('ลบไฟล์')}
              </button>
            </div>
          </>
        ) : rx.photo ? (
          <>
            <img
              className="rxph"
              src={rx.photo}
              alt={t('ใบรับของ')}
              onClick={() => fileRef.current?.click()}
            />
            <div className="row" style={{ marginTop: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="pri"
                disabled={aiLoading}
                onClick={() =>
                  runAiExtraction({
                    imageDataUrl: rx.photo,
                    fallbackLines: rx.lines || undefined,
                    src: 'photo',
                    fileName: rx.fileName,
                  })
                }
              >
                {aiLoading ? t('AI กำลังอ่านรูป...') : t('ให้ AI อ่านรูปอีกครั้ง')}
              </button>
              <button
                type="button"
                disabled={aiLoading}
                onClick={() => setRx({ photo: null, lines: null })}
              >
                <Icon name="close" size={16} />
                {t('ลบรูป')}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="rxdrop"
            disabled={aiLoading}
            onClick={() => fileRef.current?.click()}
          >
            <span className="rxicons">
              <Icon name="image" size={36} />
              <i className="rxsl" />
              <Icon name="file" size={36} />
            </span>
            <span className="rxlbl">
              {aiLoading ? t('AI กำลังอ่านข้อมูลและจับคู่สินค้า...') : t('ไฟล์หรือรูป (AI อ่านยอดยกเข้า)')}
            </span>
            <span className="rxsub">
              {t('ลากรูปใบรับของ ไฟล์ Excel/CSV มาวาง หรือกดเพื่อเลือก ให้ AI อ่านและเพิ่มยอดยกเข้าอัตโนมัติ')}
            </span>
          </button>
        )}

        {aiLoading && (
          <div className="dstat warn" style={{ marginTop: 12, justifyContent: 'center' }}>
            <span className="st">
              <Icon name="live" size={16} />
              <span>{t('AI กำลังอ่านรายการสินค้าและจับคู่กับรายการที่มีอยู่ในระบบ...')}</span>
            </span>
          </div>
        )}

        {!aiLoading && rx.aiSummary && (
          <div className="dstat ok" style={{ marginTop: 12 }}>
            <span className="st">
              <Icon name="check" size={16} />
              <span>{rx.aiSummary}</span>
            </span>
          </div>
        )}
      </section>

      {!rx.photo && rx.src !== 'sheet' && rx.src !== 'manual' && (
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="pri"
            disabled={aiLoading}
            onClick={() => setShowTextPrompt((prev) => !prev)}
          >
            <Icon name="file" size={16} /> {t('วางข้อความให้ AI อ่านยอดยกเข้า')}
          </button>
          <button
            type="button"
            disabled={aiLoading}
            onClick={() =>
              setRx({
                photo: null,
                src: 'manual',
                lines: rx.lines || [{ name: '', doc: 0, act: 0 }],
              })
            }
          >
            <Icon name="plus" size={16} /> {t('กรอกข้อมูลเอง')}
          </button>
        </div>
      )}

      {showTextPrompt && (
        <section className="rxsec card" style={{ marginTop: 12 }}>
          <div className="top">
            <b>{t('วางข้อความรายการสินค้าเพื่อให้ AI อ่านและจับคู่ยอดยกเข้า')}</b>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setTextInput(
                  [
                    '1052 แลตติซสตรอว์เบอร์รี 18',
                    '4002 บราวนี่ 27',
                    '1046 มินิช็อกโกแลตครัวซองต์ 10',
                    '1045 มินิช็อกสติ๊ก 8',
                    '2003 พายเนื้อปาล์ม 20',
                    '82004 แป้งทาร์ตไข่ 11',
                  ].join('\n')
                );
              }}
            >
              {t('ใส่ข้อความตัวอย่าง')}
            </button>
          </div>
          <p className="hint">
            {t('วางข้อความจาก LINE, ตาราง Excel หรือพิมพ์รหัส/ชื่อสินค้าตามด้วยจำนวน (บรรทัดละ 1 รายการ)')}
          </p>
          <textarea
            id="ai-receive-text"
            rows={5}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
            placeholder={t('ตัวอย่าง:\n1052 แลตติซสตรอว์เบอร์รี 18\n4002 บราวนี่ 27\nM14 ถั่วบด 5')}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
          <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowTextPrompt(false)}>
              {t('ยกเลิก')}
            </button>
            <button
              type="button"
              className="pri"
              disabled={aiLoading}
              onClick={handleAnalyzeText}
            >
              <Icon name="check" size={16} />
              {aiLoading ? t('กำลังอ่านด้วย AI...') : t('ให้ AI อ่านและจับคู่รายการ')}
            </button>
          </div>
        </section>
      )}

      {rx.lines && (
        <>
          <section className="rxsec">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{t('รายการที่รับ (เตรียมเพิ่มยอดยกเข้า)')}</h3>
              <div className="chips" style={{ margin: 0 }}>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={carryMode === 'add'}
                  onClick={() => setCarryMode('add')}
                >
                  {t('+ บวกเพิ่มในยอดยกเข้าเดิม')}
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={carryMode === 'set'}
                  onClick={() => setCarryMode('set')}
                >
                  {t('= ตั้งเป็นยอดยกเข้าใหม่')}
                </button>
              </div>
            </div>

            <p className="hint" style={{ marginTop: 6 }}>
              {t('พบในรายการที่มีอยู่')} <b>{matchedLinesCount}</b> {t('รายการ')} · {t('สินค้าใหม่')}{' '}
              <b>{newLinesCount}</b> {t('รายการ')} · {t('รวมจำนวนยอดยกเข้า')}{' '}
              <b>+{fmt(totalActQty)}</b> {t('ชิ้น')}
            </p>

            <datalist id="rxlist">
              {activeItems.map((o) => (
                <option key={o.code} value={o.name}>
                  {o.code} - {o.name}
                </option>
              ))}
            </datalist>

            <div className="scroll">
              <table className="rxtab check-table">
                <thead>
                  <tr>
                    <th className="col-text">{t('สินค้า (จับคู่รายการที่มีอยู่)')}</th>
                    <th>{t('ตามเอกสาร')}</th>
                    <th>{t('รับจริง (+ยอดยกเข้า)')}</th>
                    <th>{t('ยอดยกเข้าใหม่')}</th>
                    <th className="col-diff">
                      <span className="diff-box">{t('ผลตรวจ')}</span>
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rx.lines.map((r, i) => {
                    const matched = rxFind(r);
                    const prevCarry = matched ? N(matched.carry) : 0;
                    const nextCarry =
                      carryMode === 'set' ? N(r.act) : prevCarry + N(r.act);
                    return (
                      <tr key={i}>
                        <td className="col-text">
                          <input
                            type="text"
                            list="rxlist"
                            aria-label={`${t('สินค้า')} ${i + 1}`}
                            value={r.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              const m = matchCatalogItem(activeItems, undefined, val);
                              const next = [...(rx.lines || [])];
                              next[i] = {
                                ...next[i],
                                code: m ? m.code : undefined,
                                name: val,
                              };
                              setRx({ ...rx, lines: next });
                            }}
                          />
                          <div style={{ marginTop: 4 }}>
                            {matched ? (
                              <span className="pill ok" style={{ fontSize: 12 }}>
                                <Icon name="check" size={12} /> {t('รหัส')} {matched.code} ·{' '}
                                {matched.name} ({t('ยอดยกเข้าเดิม')} {fmt(prevCarry)})
                              </span>
                            ) : r.name.trim() ? (
                              <span className="pill warn" style={{ fontSize: 12 }}>
                                {t('สินค้าใหม่ (ไม่อยู่ในรายการเดิม)')}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <input
                            className="num"
                            type="number"
                            min="0"
                            aria-label={`${t('ตามเอกสาร')} ${i + 1}`}
                            value={r.doc}
                            onChange={(e) => {
                              const next = [...(rx.lines || [])];
                              next[i] = { ...next[i], doc: N(e.target.value) };
                              setRx({ ...rx, lines: next });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="num"
                            type="number"
                            min="0"
                            aria-label={`${t('รับจริง')} ${i + 1}`}
                            value={r.act}
                            onChange={(e) => {
                              const next = [...(rx.lines || [])];
                              next[i] = { ...next[i], act: N(e.target.value) };
                              setRx({ ...rx, lines: next });
                            }}
                          />
                        </td>
                        <td>
                          <b>{fmt(nextCarry)}</b>
                        </td>
                        <td className="col-diff">
                          <span className="diff-box">{rxRes(r)}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-x"
                            aria-label={t('ลบ')}
                            onClick={() => {
                              const next = (rx.lines || []).filter((_, idx) => idx !== i);
                              setRx({
                                ...rx,
                                lines: next.length ? next : null,
                                src: next.length ? rx.src : undefined,
                              });
                            }}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() =>
                  setRx({ ...rx, lines: [...(rx.lines || []), { name: '', doc: 0, act: 0 }] })
                }
              >
                <Icon name="plus" size={16} />
                {t('เพิ่มรายการเอง')}
              </button>
            </div>
          </section>

          <section className="rxsec">
            <p className="hint">
              {t('เมื่อกดบันทึก ระบบจะเพิ่มจำนวนรับจริงเข้าในช่อง "ยอดยกเข้า" ของแต่ละรายการที่มีอยู่ทันที')}
            </p>
            <div className="row">
              <button type="button" className="pri" onClick={handleSave}>
                <Icon name="check" size={16} />
                {t('บันทึกและเพิ่มยอดยกเข้า')} ({(rx.lines || []).filter((r) => r.name.trim()).length}{' '}
                {t('รายการ')})
              </button>
            </div>
          </section>
        </>
      )}

      <section className="rxsec">
        <h3>{t('ประวัติการรับของ')}</h3>
        <p className="hint">{t('แตะรูปเพื่อดูขนาดเต็ม')}</p>
        {receipts.length ? (
          receipts.map((r) => {
            const photoUrl = generateReceiptSvgUrl(r, dmy);
            const totalAct = (r.lines || []).reduce((a, l) => a + N(l.act), 0);
            return (
              <div key={r.id} className="rxh">
                <img
                  className="rxthumb"
                  src={photoUrl}
                  loading="lazy"
                  decoding="async"
                  alt={dmy(r.date)}
                  onClick={() => onOpenPhoto(photoUrl)}
                />
                <div>
                  <b>{dmy(r.date)}</b>
                  <div className="hint">
                    {(r.lines || []).length} {t('รายการ · เพิ่มยอดยกเข้า')} +{fmt(totalAct)}{' '}
                    {t('ชิ้น')}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">{t('ยังไม่มีรายการ')}</div>
        )}
      </section>
    </div>
  );
};
