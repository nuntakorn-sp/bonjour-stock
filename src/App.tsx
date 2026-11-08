import React, { useState, useEffect, useMemo } from 'react';
import {
  TabId,
  StockItem,
  ShiftData,
  DailyRecord,
  ReceiptRecord,
  ReceiptLine,
  AuditRecord,
  VarianceRecord,
  SaleType,
  SaleLine,
  UserProfile,
} from './types';
import { INITIAL_SEED } from './data/seedData';
import {
  N,
  fmt,
  baht,
  calc,
  isC,
  unitPriceFor,
  addDay,
  nextCode,
  normalizeStockItems,
  computeNextShiftItem,
  buildShiftVariances,
  applyReceiptToStockItems,
} from './utils/calculations';
import { TR, translateHtml } from './utils/i18n';
import { Icon } from './components/Icons';
import { AuthView } from './components/AuthView';
import { StockView } from './components/StockView';
import { sb, isApprovedUser, adm, userToProfile, LS } from './utils/supabase';
import { useRemoteSync } from './utils/useRemoteSync';
import { ReceiveView } from './components/ReceiveView';
import { CashView } from './components/CashView';
import { ReportView } from './components/ReportView';
import { SettingsView } from './components/SettingsView';
import {
  KeypadModal,
  DetailModal,
  AddItemModal,
  SaleChannelModal,
  CalendarModal,
  UserEditModal,
  VariancesModal,
  ConfirmModal,
  PhotoModal,
} from './components/Modals';

const TABS: [TabId, string][] = [
  ['stock', 'นับสต๊อก'],
  ['receive', 'รับของ'],
  ['cash', 'การเงิน'],
  ['report', 'รายงาน'],
  ['set', 'ตั้งค่า'],
];

const STORAGE_KEY = 'bonjour_app_state_v2';

export default function App() {
  const [lang, setLang] = useState<'th' | 'en'>('th');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('bj_theme') as 'auto' | 'light' | 'dark') || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [tab, setTab] = useState<TabId>('stock');
  const [kind, setKind] = useState<'snack' | 'material'>('snack');
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState<string>('');
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});

  // Load persisted or seed data
  const initialData = useMemo(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          return {
            ...parsed,
            items: normalizeStockItems(parsed.items as StockItem[]),
          };
        }
      }
    } catch {}
    return {
      ...INITIAL_SEED,
      items: normalizeStockItems(INITIAL_SEED.items as StockItem[]),
    };
  }, []);

  const [items, setItems] = useState<StockItem[]>(initialData.items as StockItem[]);
  const [shift, setShift] = useState<ShiftData>(
    (initialData.shift as ShiftData) || {
      date: '2026-11-04',
      branch: 'อมตะนคร',
      cash: 100,
      qr: 140,
      pos: 240,
      float: 3000,
      locked: false,
      expenses: [],
    }
  );
  const [daily, setDaily] = useState<DailyRecord[]>(initialData.daily as DailyRecord[]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>(
    initialData.receipts as ReceiptRecord[]
  );
  const [audit, setAudit] = useState<AuditRecord[]>(initialData.audit as AuditRecord[]);
  const [variances, setVariances] = useState<VarianceRecord[]>(
    initialData.variances as VarianceRecord[]
  );
  const [saleTypes] = useState<SaleType[]>(initialData.saleTypes as SaleType[]);
  const [saleLines, setSaleLines] = useState<SaleLine[]>(initialData.saleLines as SaleLine[]);
  const [users, setUsers] = useState<UserProfile[]>(initialData.users as UserProfile[]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [splashVisible, setSplashVisible] = useState(false);
  const [netStatus, setNetStatus] = useState<{ label: string; cls: 'ok' | 'warn' | 'bad' }>({
    label: 'ออนไลน์',
    cls: 'ok',
  });

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('login') === '1' || LS('bj_logged_out') === '1') return null;
      const savedUser = LS('bj_session_user');
      if (savedUser) {
        try {
          return JSON.parse(savedUser) as UserProfile;
        } catch {}
      }
    }
    return null;
  });

  // Pull the shared state from Supabase and keep local edits mirrored back.
  // Flows both ways via realtime so every logged-in device sees the same data.
  const syncStatus = useRemoteSync(
    Boolean(currentUser),
    { items, shift, daily, receipts, audit, variances, saleLines },
    { setItems, setShift, setDaily, setReceipts, setAudit, setVariances, setSaleLines }
  );

  useEffect(() => {
    if (!currentUser) return;
    if (!syncStatus.ready) {
      setNetStatus({ label: 'กำลังซิงก์…', cls: 'warn' });
    } else if (syncStatus.online) {
      setNetStatus({ label: 'ซิงก์แล้ว', cls: 'ok' });
    } else {
      setNetStatus({ label: 'ออฟไลน์ (ยังไม่ซิงก์)', cls: 'bad' });
    }
  }, [currentUser, syncStatus.ready, syncStatus.online]);

  const loadRemoteUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await adm<{ users?: UserProfile[] }>('list');
      if (res && Array.isArray(res.users)) {
        setUsers(res.users);
      }
    } catch {
      // Keep existing local users list when no Supabase Edge Function session token is active
    } finally {
      setUsersLoading(false);
    }
  };

  // Initial session check matching reference app (lines 1174-1178)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (!mounted) return;
        if (data && data.session && data.session.user) {
          const { approved, profile } = await isApprovedUser(data.session.user);
          if (!mounted) return;
          if (approved && !profile?.must_change_password) {
            const prof = userToProfile(data.session.user, profile);
            LS('bj_session_user', JSON.stringify(prof));
            LS('bj_logged_out', null);
            setCurrentUser(prof);
            setNetStatus({ label: 'ออนไลน์', cls: 'ok' });
            if (prof.role === 'admin') {
              loadRemoteUsers();
            }
          } else {
            await sb.auth.signOut();
          }
        }
      } catch {
        // Keep current session state on network error
      }
    })();

    const onOnline = () => setNetStatus({ label: 'ออนไลน์', cls: 'ok' });
    const onOffline = () => setNetStatus({ label: 'ออฟไลน์ (ยังไม่บันทึก)', cls: 'bad' });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      mounted = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Save state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          items,
          shift,
          daily,
          receipts,
          audit,
          variances,
          saleTypes,
          saleLines,
          users,
        })
      );
    } catch {}
  }, [items, shift, daily, receipts, audit, variances, saleTypes, saleLines, users]);

  // Apply theme attribute to <html>.
  // `auto` follows the OS preference live (listens to the matchMedia change event).
  useEffect(() => {
    const root = document.documentElement;
    try {
      localStorage.setItem('bj_theme', theme);
    } catch {}

    if (theme !== 'auto') {
      root.setAttribute('data-theme', theme);
      return;
    }

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => root.setAttribute('data-theme', mql.matches ? 'dark' : 'light');
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);

  // Toast state
  const [toastState, setToastState] = useState<{ msg: string; err?: boolean } | null>(null);
  const showToast = (msg: string, err?: boolean) => {
    setToastState({ msg, err });
  };
  useEffect(() => {
    if (!toastState) return;
    const timer = setTimeout(() => setToastState(null), toastState.err ? 4000 : 1800);
    return () => clearTimeout(timer);
  }, [toastState]);

  // Modals state
  const [keypadModal, setKeypadModal] = useState<{
    title: string;
    subtitle: string;
    initialValue: string;
    allowDecimal: boolean;
    onConfirm: (val: string) => void;
  } | null>(null);
  const [detailModalKey, setDetailModalKey] = useState<
    'counted' | 'check' | 'sold' | 'net' | null
  >(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [saleModalCode, setSaleModalCode] = useState<string | null>(null);
  const [variancesModalOpen, setVariancesModalOpen] = useState(false);
  const [photoModalSrc, setPhotoModalSrc] = useState<string | null>(null);
  const [calendarModal, setCalendarModal] = useState<{
    anchorDate: string;
    winN: number;
    onSelectDate: (d: string) => void;
  } | null>(null);
  const [userModal, setUserModal] = useState<UserProfile | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Lock background scroll whenever any modal is open — without this the page
  // scrolls behind the overlay (especially bad on mobile, where tapping outside
  // the card drags the page instead of closing).
  const anyModalOpen =
    Boolean(keypadModal) ||
    Boolean(detailModalKey) ||
    addModalOpen ||
    Boolean(saleModalCode) ||
    variancesModalOpen ||
    Boolean(photoModalSrc) ||
    Boolean(calendarModal) ||
    Boolean(userModal) ||
    Boolean(confirmModal);
  useEffect(() => {
    if (anyModalOpen) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => document.body.classList.remove('no-scroll');
  }, [anyModalOpen]);

  const itemEnMap = useMemo(() => {
    const m: Record<string, string> = {};
    items.forEach((it) => {
      if (it.name && it.nameEn) m[it.name] = it.nameEn;
      if (it.cat && it.catEn) m[it.cat] = it.catEn;
    });
    return m;
  }, [items]);

  const t = (s: string): string => {
    if (lang !== 'en') return s;
    if (TR[s]) return TR[s];
    if (itemEnMap[s]) return itemEnMap[s];
    return translateHtml(s, lang);
  };

  const dmy = (s: string): string => {
    if (!s) return '';
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'th-TH', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(s + 'T12:00:00+07:00'));
    } catch {
      return s;
    }
  };

  const liveItems = useMemo(() => {
    return items
      .filter((o) => !o.deleted)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }))
      .map((o) => ({
        ...o,
        _cat: o.cat,
        ...(lang === 'en' ? { name: o.nameEn || o.name, cat: o.catEn || o.cat } : {}),
      }));
  }, [items, lang]);

  const addAuditLog = (
    code: string,
    field: string,
    fromVal: string | number | boolean,
    toVal: string | number | boolean,
    why = ''
  ) => {
    const newEntry: AuditRecord = {
      id: Date.now() + Math.random(),
      ts: Date.now(),
      by: currentUser?.id.slice(0, 6) || 'admin',
      code,
      field,
      from: fromVal,
      to: toVal,
      why,
    };
    setAudit((prev) => [newEntry, ...prev].slice(0, 20));
  };

  const handleSetField = (code: string, field: keyof StockItem, raw: string | number) => {
    const o = items.find((x) => x.code === code);
    if (!o) return;
    if (shift.locked) {
      showToast(t('กะนี้ล็อกแล้ว ปลดล็อกก่อนจึงแก้ได้'), true);
      return;
    }
    const isMat = o.kind === 'material';
    const v = Number(raw);
    const isValid =
      raw !== '' &&
      Number.isFinite(v) &&
      v >= 0 &&
      (isMat || field === 'price' || field === 'cost'
        ? Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6
        : Number.isInteger(v));
    if (!isValid) {
      showToast(
        isMat
          ? t('ใส่ตัวเลขตั้งแต่ 0 ขึ้นไป ทศนิยมได้ไม่เกิน 3 ตำแหน่ง')
          : t('ใส่จำนวนเต็มตั้งแต่ 0 ขึ้นไป'),
        true
      );
      return;
    }

    const prev = N(o[field]);
    if (v === prev && field !== 'actual') return;

    const clearMatch = field === 'actual' && o.matchPrev && v !== N(o.carry);
    setItems((prevItems) =>
      prevItems.map((it) => {
        if (it.code !== code) return it;
        if (field === 'actual') {
          return {
            ...it,
            actual: v,
            counted: true,
            ...(clearMatch ? { matchPrev: null } : {}),
          };
        }
        return {
          ...it,
          [field]: v,
        };
      })
    );

    addAuditLog(code, String(field), prev, v);
    if (field === 'sold' && !isMat && v !== prev) {
      const diffQty = v - prev;
      const price = unitPriceFor(o, saleTypes.find((st) => st.id === 'normal'));
      const newLine: SaleLine = {
        id: `${shift.date}-${code}-${Date.now()}`,
        date: shift.date,
        code,
        typeId: 'normal',
        qty: diffQty,
        unitPrice: price,
        unitCost: N(o.cost),
        amount: Math.round(price * diffQty * 100) / 100,
        ts: Date.now(),
      };
      setSaleLines((prevLines) => [newLine, ...prevLines]);
    }
    showToast(t('บันทึกแล้ว'));
  };

  const handleStepActual = (code: string, delta: number) => {
    const o = items.find((x) => x.code === code);
    if (!o || shift.locked) return;
    const prev = N(o.actual);
    const nv = Math.max(0, prev + delta);
    if (nv === prev && isC(o)) return;
    handleSetField(code, 'actual', nv);
  };

  const handleMatchItem = (code: string) => {
    const o = items.find((x) => x.code === code);
    if (!o || shift.locked) return;
    if (o.matchPrev) {
      const p = o.matchPrev;
      const from = N(o.actual);
      setItems((prev) =>
        prev.map((it) =>
          it.code === code ? { ...it, actual: p.actual, counted: p.counted, matchPrev: null } : it
        )
      );
      addAuditLog(code, 'actual', from, p.actual, 'ยกเลิกตรงยอด');
      showToast(t('ยกเลิกตรงยอดแล้ว'));
      return;
    }
    if (isC(o) && calc(o).diff === 0) {
      setItems((prev) =>
        prev.map((it) => (it.code === code ? { ...it, counted: false } : it))
      );
      addAuditLog(code, 'counted', 'true', 'false', 'ยกเลิกการนับ');
      showToast(t('ยกเลิกการนับแล้ว'));
      return;
    }
    const prevState = { actual: N(o.actual), counted: isC(o) };
    const to = N(o.carry);
    setItems((prev) =>
      prev.map((it) =>
        it.code === code ? { ...it, actual: to, counted: true, matchPrev: prevState } : it
      )
    );
    addAuditLog(code, 'actual', prevState.actual, to, 'ตรงยอด');
    showToast(t('ตรงยอดแล้ว'));
  };

  const handleMatchAll = () => {
    if (shift.locked) return;
    const uncounted = liveItems.filter((o) => !isC(o));
    if (!uncounted.length) {
      showToast(t('ทุกรายการนับแล้ว'));
      return;
    }
    setConfirmModal({
      title: t('ตรงยอดทั้งหมด'),
      body: `${uncounted.length} ${t('รายการที่ยังไม่นับ จะตั้งนับจริงเท่ากับยอดยกเข้า\nไม่สร้างผลต่าง')}`,
      confirmLabel: t('ตรงยอดทั้งหมด'),
      onConfirm: () => {
        const codes = new Set(uncounted.map((u) => u.code));
        setItems((prev) =>
          prev.map((it) =>
            codes.has(it.code)
              ? {
                  ...it,
                  actual: calc(it).diff !== 0 ? N(it.actual) : N(it.carry),
                  counted: true,
                }
              : it
          )
        );
        addAuditLog('-', 'matchAll', '', String(uncounted.length), 'ตรงยอดทั้งหมด');
        showToast(`${t('ตรงยอด')} ${uncounted.length} ${t('รายการแล้ว')}`);
        setConfirmModal(null);
      },
    });
  };

  const handleOpenItemPad = (code: string, field: keyof StockItem) => {
    const o = items.find((x) => x.code === code);
    if (!o || shift.locked) return;
    const labels: Record<string, string> = {
      sold: t('ขาย (ชิ้น)'),
      broken: t('ของเสีย (ชิ้น)'),
      carry: t('ยอดยกเข้า (ชิ้น)'),
      out: t('โอนออก (ชิ้น)'),
      price: t('ราคาต่อชิ้น (บาท)'),
      cost: t('ต้นทุนต่อชิ้น (บาท)'),
    };
    setKeypadModal({
      title: (lang === 'en' && o.nameEn) || o.name,
      subtitle: labels[field] || String(field),
      initialValue: String(N(o[field])),
      allowDecimal: field === 'price',
      onConfirm: (val) => {
        setKeypadModal(null);
        const numVal = val === '' ? 0 : Number(val);
        if (numVal !== N(o[field])) {
          handleSetField(code, field, numVal);
        }
      },
    });
  };

  const handleHideItem = (code: string) => {
    const o = items.find((x) => x.code === code);
    if (!o) return;
    setConfirmModal({
      title: t('ซ่อนสินค้า'),
      body: `"${o.name}" ${t('จะถูกซ่อนจากรายการ\nข้อมูลยังอยู่และกู้คืนได้')}`,
      confirmLabel: t('ซ่อน'),
      danger: true,
      onConfirm: () => {
        setItems((prev) =>
          prev.map((it) => (it.code === code ? { ...it, deleted: true } : it))
        );
        addAuditLog(code, 'deleted', 'false', 'true');
        showToast(t('ซ่อนสินค้าแล้ว'));
        setConfirmModal(null);
      },
    });
  };

  const handleSaveReceipt = (params: {
    photo: string | null;
    src: 'photo' | 'sheet' | 'manual';
    fileName?: string | null;
    lines: ReceiptLine[];
    mode?: 'add' | 'set';
  }) => {
    const result = applyReceiptToStockItems(items, params.lines, params.mode || 'add');

    for (const ch of result.changes) {
      addAuditLog(
        ch.code,
        'carry',
        ch.prevCarry,
        ch.nextCarry,
        params.mode === 'set' ? 'ตั้งยอดยกเข้า (รับของ)' : `เพิ่มยอดยกเข้า +${ch.addedCarry}`
      );
    }

    const newReceipt: ReceiptRecord = {
      id: 'rc' + Date.now(),
      date: shift.date,
      ts: Date.now(),
      photo: params.photo,
      src: params.src,
      fileName: params.fileName || null,
      lines: result.savedLines,
    };

    setItems(result.updatedItems);
    setReceipts((prev) => [newReceipt, ...prev]);
    showToast(
      `${t('เพิ่มยอดยกเข้าสำเร็จ')} ${result.changes.length} ${t('รายการ')} (+${fmt(
        result.totalAddedCarry
      )} ${t('ชิ้น')})`
    );
  };

  const handleCloseShift = () => {
    const unList = liveItems.filter((o) => !isC(o));
    if (unList.length > 0) {
      showToast(`${t('ยังไม่ได้นับ')} ${unList.length} ${t('รายการ นับให้ครบก่อนปิดกะ')}`, true);
      const hasUncountedInCurKind = unList.some((o) => (o.kind || 'snack') === kind);
      if (!hasUncountedInCurKind && unList[0]) {
        setKind((unList[0].kind || 'snack') as 'snack' | 'material');
      }
      setTab('stock');
      setCat('__un');
      return;
    }
    const R = liveItems.map((o) => ({ ...o, ...calc(o) }));
    const neg = R.filter((o) => o.net < 0).length;
    const exp = shift.expenses.reduce((a, e) => a + N(e.amt), 0);
    const gross = N(shift.cash) + N(shift.qr);
    const posOk = shift.pos != null && N(shift.pos) === gross;
    const nx = addDay(shift.date);

    setConfirmModal({
      title: t('ปิดกะ'),
      body: `${t('วันที่')} ${dmy(shift.date)}\n${t('ยอดขายรวม')} ${baht(gross)} · ${
        posOk ? t('ตรงบิลสรุป') : t('ยังไม่ตรงหรือไม่ได้กรอกบิลสรุป')
      }\n${t('ขายเกินสต๊อก')} ${neg} ${t('รายการ (ยกไปเป็น 0)')}\n${t(
        'จะเปลี่ยนเป็นวันที่'
      )} ${dmy(nx)} ${t('ย้อนกลับไม่ได้')}`,
      confirmLabel: t('ปิดกะ'),
      danger: true,
      onConfirm: () => {
        const nets: Record<string, number> = {};
        const sys: Record<string, number> = {};
        const cats: Record<string, number> = {};
        R.forEach((o) => {
          const nextIt = computeNextShiftItem(o);
          nets[o.code] = nextIt.actual;
          sys[o.code] = nextIt.carry;
          if (o.kind === 'material') return;
          const k = o._cat || o.cat || 'ไม่ระบุหมวด';
          cats[k] = (cats[k] || 0) + N(o.sold);
        });

        const rec: DailyRecord = {
          date: shift.date,
          closed: true,
          sys,
          sold: R.filter((o) => o.kind !== 'material').reduce((a, o) => a + N(o.sold), 0),
          gross,
          cash: N(shift.cash),
          qr: N(shift.qr),
          exp,
          remit: N(shift.cash) - exp,
          broken: R.filter((o) => o.kind !== 'material').reduce((a, o) => a + N(o.broken), 0),
          lossVal: R.filter((o) => o.kind !== 'material').reduce(
            (a, o) => a + N(o.broken) * N(o.cost),
            0
          ),
          cats,
          nets,
          posOk,
          by: currentUser?.id.slice(0, 6) || 'admin',
          counterName: currentUser?.name || currentUser?.email || 'Admin',
          counterTitle: 'ผู้จัดการร้าน',
        };

        setDaily((prev) => [rec, ...prev.filter((d) => d.date !== shift.date)]);
        setVariances((prev) => buildShiftVariances(shift.date, liveItems, prev));
        setItems((prev) => prev.map((it) => computeNextShiftItem(it)));
        setShift((prev) => ({
          ...prev,
          date: nx,
          cash: 0,
          qr: 0,
          pos: null,
          expenses: [],
          locked: false,
          targetSales: null,
          targetCustomers: null,
          targetPerBill: null,
        }));
        addAuditLog('-', 'close', shift.date, nx);
        setConfirmModal(null);
        setTab('stock');
        setCat('all');
        showToast(t('ปิดกะแล้ว เริ่มวันถัดไป'));
      },
    });
  };

  if (!currentUser) {
    return (
      <>
        <div
          id="splash"
          className={splashVisible ? '' : 'gone'}
          role="status"
          aria-live="polite"
          aria-label={t('กำลังโหลด')}
        >
          <div className="sp-box">
            <div className="sp-logo">
              <img id="spImg" src="/bonjour-logo.png" alt="" />
            </div>
            <div className="sp-name">BONJOUR</div>
            <div className="sp-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        <AuthView
          onLogin={(u) => {
            setSplashVisible(true);
            LS('bj_session_user', JSON.stringify(u));
            LS('bj_logged_out', null);
            setCurrentUser(u);
            setNetStatus({ label: 'ออนไลน์', cls: 'ok' });
            if (u.role === 'admin') {
              loadRemoteUsers();
            }
            setTimeout(() => setSplashVisible(false), 320);
          }}
          onRegisterStaff={(nm, em) => {
            setUsers((prev) => [
              ...prev,
              {
                id: 'u-' + Date.now(),
                name: nm,
                email: em,
                role: 'staff',
                status: 'pending',
              },
            ]);
          }}
          t={t}
        />
        {toastState && (
          <div id="toast" className={toastState.err ? 'err' : ''} role="status" aria-live="polite">
            {toastState.msg}
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <div
        id="splash"
        className={splashVisible ? '' : 'gone'}
        role="status"
        aria-live="polite"
        aria-label={t('กำลังโหลด')}
      >
        <div className="sp-box">
          <div className="sp-logo">
            <img id="spImg" src="/bonjour-logo.png" alt="" />
          </div>
          <div className="sp-name">BONJOUR</div>
          <div className="sp-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>

      <header className="bj-header">
        <span className="logo" role="img" aria-label="BONJOUR" />
        <span className="brand">BONJOUR</span>
        <h1 id="title">{t('ระบบปิดกะและควบคุมสต๊อก')}</h1>
        <span className="pill" id="branch">
          {t(shift.branch)}
        </span>
        <span className="pill" id="date">
          {dmy(shift.date)}
        </span>
        <span className={`pill ${netStatus.cls}`} id="net">
          {t(netStatus.label)}
        </span>
        <button
          type="button"
          className="pill lang-btn"
          id="lang-toggle"
          aria-label={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
          onClick={() => setLang((prev) => (prev === 'th' ? 'en' : 'th'))}
        >
          <Icon name="globe" size={14} />
          {lang === 'th' ? 'TH / EN' : 'EN / TH'}
        </button>
      </header>

      <main className="bj-main" id="app">
        {tab === 'stock' && (
          <StockView
            items={items}
            liveItems={liveItems}
            shift={shift}
            variances={variances}
            kind={kind}
            setKind={setKind}
            cat={cat}
            setCat={setCat}
            q={q}
            setQ={setQ}
            openDetails={openDetails}
            setOpenDetails={setOpenDetails}
            onStepActual={handleStepActual}
            onSetField={handleSetField}
            onMatchItem={handleMatchItem}
            onMatchAll={handleMatchAll}
            onOpenAdd={() => setAddModalOpen(true)}
            onOpenSale={(code) => setSaleModalCode(code)}
            onOpenPad={handleOpenItemPad}
            onOpenDetail={(k) => setDetailModalKey(k)}
            onOpenVariances={() => setVariancesModalOpen(true)}
            onHideItem={handleHideItem}
            t={t}
          />
        )}

        {tab === 'receive' && (
          <ReceiveView
            items={items}
            liveItems={liveItems}
            receipts={receipts}
            dmy={dmy}
            onSaveReceipt={handleSaveReceipt}
            onOpenPhoto={(src) => {
              if (!src) {
                showToast(t('รายการนี้รับจากไฟล์ ไม่มีรูปหลักฐาน'));
                return;
              }
              setPhotoModalSrc(src);
            }}
            onToast={showToast}
            t={t}
          />
        )}

        {tab === 'cash' && (
          <CashView
            shift={shift}
            saleLines={saleLines}
            dmy={dmy}
            onOpenMoneyPad={(params) =>
              setKeypadModal({
                title: params.label,
                subtitle: params.isInt ? t('(คน)') : t('(บาท)'),
                initialValue: params.value,
                allowDecimal: !params.isInt,
                onConfirm: (val) => {
                  setKeypadModal(null);
                  params.onCommit(val);
                },
              })
            }
            onUpdateShiftField={(field, val) => {
              setShift((prev) => ({ ...prev, [field]: val }));
              if (
                field === 'targetSales' ||
                field === 'targetCustomers' ||
                field === 'targetPerBill'
              ) {
                showToast(t('บันทึกเป้าแล้ว'));
              } else {
                showToast(t('บันทึกแล้ว'));
              }
            }}
            onAddExpense={(label, amt) => {
              setShift((prev) => ({
                ...prev,
                expenses: [...prev.expenses, { id: String(Date.now()), label, amt }],
              }));
              showToast(t('เพิ่มค่าใช้จ่ายแล้ว'));
            }}
            onDeleteExpense={(id) => {
              setConfirmModal({
                title: t('ลบค่าใช้จ่าย'),
                body: t('ลบรายการนี้ออกจากกะ?'),
                confirmLabel: t('ลบ'),
                danger: true,
                onConfirm: () => {
                  setShift((prev) => ({
                    ...prev,
                    expenses: prev.expenses.filter((x) => x.id !== id),
                  }));
                  showToast(t('ลบแล้ว'));
                  setConfirmModal(null);
                },
              });
            }}
            t={t}
          />
        )}

        {tab === 'report' && (
          <ReportView
            items={items}
            liveItems={liveItems}
            shift={shift}
            daily={daily}
            saleLines={saleLines}
            variances={variances}
            lang={lang}
            dmy={dmy}
            onOpenCalendar={(anchorDate, winN, onSelectDate) =>
              setCalendarModal({ anchorDate, winN, onSelectDate })
            }
            onOpenVariances={() => setVariancesModalOpen(true)}
            t={t}
          />
        )}

        {tab === 'set' && (
          <SettingsView
            shift={shift}
            currentUser={currentUser}
            users={users}
            usersLoading={usersLoading}
            usersError={usersError}
            audit={audit}
            lang={lang}
            theme={theme}
            dmy={dmy}
            onUpdateBranch={(branch) => {
              if (!branch.trim()) {
                showToast(t('ห้ามเว้นว่าง'), true);
                return;
              }
              setShift((prev) => ({ ...prev, branch }));
              showToast(t('บันทึกแล้ว'));
            }}
            onCloseShift={handleCloseShift}
            onLogout={() => {
              setConfirmModal({
                title: t('ออกจากระบบ'),
                body: '',
                confirmLabel: t('ออกจากระบบ'),
                onConfirm: async () => {
                  setConfirmModal(null);
                  LS('bj_logged_out', '1');
                  LS('bj_session_user', null);
                  try {
                    await sb.auth.signOut();
                  } catch {}
                  setCurrentUser(null);
                },
              });
            }}
            onSetLang={(l) => setLang(l)}
            onSetTheme={(th) => setTheme(th)}
            onExportBackup={() => {
              const blob = new Blob([JSON.stringify({ shift, items }, null, 2)], {
                type: 'application/json',
              });
              const u = URL.createObjectURL(blob);
              const a = Object.assign(document.createElement('a'), {
                href: u,
                download: `bonjour-${shift.date}.json`,
              });
              document.body.appendChild(a);
              a.click();
              a.remove();
              showToast(t('ดาวน์โหลดไฟล์สำรองแล้ว'));
            }}
            onImportBackup={async (file) => {
              try {
                const j = JSON.parse(await file.text());
                const arr = Array.isArray(j)
                  ? j
                  : j.items || j.products || j.stock || j.data;
                if (!Array.isArray(arr) || !arr.length) {
                  showToast(t('ไม่พบรายการสินค้าในไฟล์'), true);
                  return;
                }
                setItems(normalizeStockItems(arr as StockItem[]));
                showToast(`${t('นำเข้า')} ${arr.length} ${t('รายการแล้ว')}`);
              } catch {
                showToast(t('ไฟล์ไม่ใช่ JSON ที่อ่านได้'), true);
              }
            }}
            onOpenUserModal={(u) => setUserModal(u)}
            onReloadUsers={loadRemoteUsers}
            t={t}
          />
        )}
      </main>

      <nav className="bj-nav" id="nav" aria-label="เมนูหลัก">
        <div className="navw">
          <span
            className="ind"
            id="ind"
            style={{
              transform: `translateX(${TABS.findIndex((x) => x[0] === tab) * 100}%)`,
            }}
          />
          <div id="tabs" className="trow">
            {TABS.map(([k, l]) => (
              <button
                type="button"
                key={k}
                aria-label={t(l)}
                aria-current={tab === k ? 'page' : undefined}
                title={t(l)}
                onClick={() => {
                  setTab(k);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <Icon name={k} size={20} />
                <span>{t(l)}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {toastState && (
        <div id="toast" className={toastState.err ? 'err' : ''} role="status" aria-live="polite">
          {toastState.msg}
        </div>
      )}

      {keypadModal && (
        <KeypadModal
          title={keypadModal.title}
          subtitle={keypadModal.subtitle}
          initialValue={keypadModal.initialValue}
          allowDecimal={keypadModal.allowDecimal}
          onConfirm={keypadModal.onConfirm}
          onClose={() => setKeypadModal(null)}
          t={t}
        />
      )}

      {detailModalKey && (
        <DetailModal
          detailKey={detailModalKey}
          liveItems={liveItems.filter((o) => (o.kind || 'snack') === kind)}
          onClose={() => setDetailModalKey(null)}
          t={t}
        />
      )}

      {addModalOpen && (
        <AddItemModal
          items={items}
          defaultKind={kind}
          categories={Array.from(new Set(items.map((o) => o.cat).filter(Boolean)))}
          onSave={(newItem) => {
            setItems((prev) => [...prev, newItem]);
            addAuditLog(newItem.code, 'created', '', newItem.name);
            setAddModalOpen(false);
            showToast(t('เพิ่มสินค้าแล้ว'));
          }}
          onClose={() => setAddModalOpen(false)}
          t={t}
        />
      )}

      {saleModalCode &&
        (() => {
          const item = items.find((o) => o.code === saleModalCode);
          if (!item) return null;
          return (
            <SaleChannelModal
              item={item}
              saleTypes={saleTypes}
              saleLines={saleLines}
              shiftDate={shift.date}
              onSaveSales={(code, qtys) => {
                let totalQty = 0;
                const newLines: SaleLine[] = [];
                Object.entries(qtys).forEach(([tid, q]) => {
                  const cleanQ = Math.max(0, Math.floor(N(q)));
                  if (cleanQ > 0) {
                    totalQty += cleanQ;
                    const st = saleTypes.find((x) => x.id === tid);
                    const p = unitPriceFor(item, st);
                    newLines.push({
                      id: `${shift.date}-${code}-${Date.now()}-${tid}`,
                      date: shift.date,
                      code,
                      typeId: tid,
                      qty: cleanQ,
                      unitPrice: p,
                      unitCost: N(item.cost),
                      amount: Math.round(p * cleanQ * 100) / 100,
                      ts: Date.now(),
                    });
                  }
                });
                const prevSold = N(item.sold);
                setItems((prev) =>
                  prev.map((it) => (it.code === code ? { ...it, sold: totalQty } : it))
                );
                setSaleLines((prev) => [
                  ...newLines,
                  ...prev.filter((l) => !(l.date === shift.date && l.code === code)),
                ]);
                if (totalQty !== prevSold) {
                  addAuditLog(code, 'sold', prevSold, totalQty);
                }
                setSaleModalCode(null);
                showToast(`${t('บันทึกยอดจำหน่าย')} ${fmt(totalQty)} ${t('ชิ้นแล้ว')}`);
              }}
              onClose={() => setSaleModalCode(null)}
              t={t}
            />
          );
        })()}

      {calendarModal && (
        <CalendarModal
          anchorDate={calendarModal.anchorDate}
          shiftDate={shift.date}
          winN={calendarModal.winN}
          daily={daily}
          lang={lang}
          dmy={dmy}
          onSelectDate={calendarModal.onSelectDate}
          onClose={() => setCalendarModal(null)}
          t={t}
        />
      )}

      {userModal && (
        <UserEditModal
          user={userModal}
          currentUserId={currentUser?.id}
          onSaveUser={async (updated) => {
            try {
              const body: Record<string, unknown> = {
                id: updated.id,
                name: updated.name,
                email: updated.email,
              };
              if (updated.id !== currentUser?.id) {
                body.role = updated.role;
              }
              await adm('update', body);
              showToast(t('บันทึกข้อมูลแล้ว'));
              await loadRemoteUsers();
            } catch (err) {
              setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
              showToast(
                err instanceof Error ? `${t('ไม่สำเร็จ: ')}${err.message}` : t('บันทึกข้อมูลแล้ว'),
                err instanceof Error
              );
            }
          }}
          onUpdateStatus={async (id, status) => {
            try {
              await adm('update', { id, status });
              showToast(status === 'approved' ? t('อนุมัติแล้ว') : t('ระงับการใช้งานแล้ว'));
              await loadRemoteUsers();
            } catch (err) {
              setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
              showToast(
                err instanceof Error
                  ? `${t('ไม่สำเร็จ: ')}${err.message}`
                  : status === 'approved'
                  ? t('อนุมัติแล้ว')
                  : t('ระงับการใช้งานแล้ว'),
                err instanceof Error
              );
            }
          }}
          onResetPassword={async (email) => {
            try {
              await adm('reset_password', { email });
              showToast(t('ส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมลแล้ว'));
            } catch (err) {
              showToast(
                err instanceof Error
                  ? `${t('ไม่สำเร็จ: ')}${err.message}`
                  : t('ส่งลิงก์ไม่สำเร็จ'),
                true
              );
            }
          }}
          onDeleteUser={(u) => {
            setConfirmModal({
              title: t('ลบผู้ใช้'),
              body: `${t('ลบบัญชี')} ${u.email} ${t('ถาวร')}`,
              confirmLabel: t('ลบ'),
              danger: true,
              onConfirm: async () => {
                setConfirmModal(null);
                try {
                  await adm('delete', { id: u.id });
                  showToast(t('ลบผู้ใช้แล้ว'));
                  await loadRemoteUsers();
                } catch (err) {
                  setUsers((prev) => prev.filter((x) => x.id !== u.id));
                  showToast(
                    err instanceof Error ? `${t('ไม่สำเร็จ: ')}${err.message}` : t('ลบผู้ใช้แล้ว'),
                    err instanceof Error
                  );
                }
              },
            });
          }}
          onClose={() => setUserModal(null)}
          onToast={showToast}
          t={t}
        />
      )}

      {variancesModalOpen && (
        <VariancesModal
          variances={variances}
          dmy={dmy}
          onResolve={(id, note) => {
            setVariances((prev) =>
              prev.map((v) =>
                v.id === id
                  ? {
                      ...v,
                      status: 'resolved',
                      note,
                      resolvedBy: currentUser?.id.slice(0, 6) || 'admin',
                      resolvedAt: Date.now(),
                    }
                  : v
              )
            );
            showToast(t('ปิดประเด็นแล้ว'));
            setVariancesModalOpen(false);
          }}
          onClose={() => setVariancesModalOpen(false)}
          onToast={showToast}
          t={t}
        />
      )}

      {photoModalSrc && (
        <PhotoModal src={photoModalSrc} onClose={() => setPhotoModalSrc(null)} t={t} />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          body={confirmModal.body}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
          t={t}
        />
      )}
    </div>
  );
}
