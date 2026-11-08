import React, { useRef } from 'react';
import { ShiftData, UserProfile, AuditRecord } from '../types';
import { Icon } from './Icons';

interface SettingsViewProps {
  shift: ShiftData;
  currentUser: UserProfile | null;
  users: UserProfile[];
  usersLoading?: boolean;
  usersError?: string;
  audit: AuditRecord[];
  lang: 'th' | 'en';
  theme: 'auto' | 'light' | 'dark';
  dmy: (s: string) => string;
  onUpdateBranch: (branch: string) => void;
  onCloseShift: () => void;
  onLogout: () => void;
  onSetLang: (lang: 'th' | 'en') => void;
  onSetTheme: (theme: 'auto' | 'light' | 'dark') => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onOpenUserModal: (user: UserProfile) => void;
  onReloadUsers?: () => void;
  t: (s: string) => string;
}

const STATUS_MAP: Record<
  'approved' | 'pending' | 'rejected',
  [string, 'ok' | 'warn' | 'bad']
> = {
  approved: ['อนุมัติแล้ว', 'ok'],
  pending: ['รออนุมัติ', 'warn'],
  rejected: ['ระงับ', 'bad'],
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  shift,
  currentUser,
  users,
  usersLoading,
  usersError,
  audit,
  lang,
  theme,
  dmy,
  onUpdateBranch,
  onCloseShift,
  onLogout,
  onSetLang,
  onSetTheme,
  onExportBackup,
  onImportBackup,
  onOpenUserModal,
  onReloadUsers,
  t,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser?.role === 'admin';
  const sortedUsers = [...users].sort((x, y) => Number(y.role === 'admin') - Number(x.role === 'admin'));
  const pendingCount = sortedUsers.filter((p) => p.status === 'pending').length;

  return (
    <div>
      <h2>{t('กะปัจจุบัน')}</h2>
      <div className="row">
        <div className="grow">
          <label htmlFor="s-branch">{t('สาขา')}</label>
          <input
            type="text"
            id="s-branch"
            value={shift.branch}
            disabled={shift.locked}
            onChange={(e) => onUpdateBranch(e.target.value)}
          />
        </div>
        <div className="grow">
          <label htmlFor="s-date">{t('วันที่บันทึก')}</label>
          <input type="text" id="s-date" value={dmy(shift.date)} disabled />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="pri" onClick={onCloseShift}>
          <Icon name="power" size={16} />
          {t('ปิดกะและเริ่มวันถัดไป')}
        </button>
        <span className="hint">{t('วันที่เปลี่ยนได้เฉพาะตอนปิดกะ')}</span>
      </div>

      {currentUser && (
        <>
          <h2>{t('บัญชี')}</h2>
          <div className="row">
            <span className="hint grow">
              {currentUser.email}
              {isAdmin ? ` · ${t('ผู้ดูแล')}` : ''}
            </span>
            <button type="button" onClick={onLogout}>
              {t('ออกจากระบบ')}
            </button>
          </div>
        </>
      )}

      <h2>{t('ภาษา')}</h2>
      <div className="row">
        <button
          type="button"
          className="chip"
          aria-pressed={lang === 'th'}
          onClick={() => onSetLang('th')}
        >
          ไทย
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={lang === 'en'}
          onClick={() => onSetLang('en')}
        >
          English
        </button>
      </div>

      <h2>{t('ธีม')}</h2>
      <select
        id="theme"
        aria-label={t('ธีม')}
        value={theme}
        onChange={(e) => onSetTheme(e.target.value as 'auto' | 'light' | 'dark')}
      >
        <option value="auto">{t('ตามระบบ')}</option>
        <option value="light">{t('สว่าง')}</option>
        <option value="dark">{t('มืด')}</option>
      </select>

      <h2>{t('สำรองและนำเข้า')}</h2>
      <div className="row">
        <button type="button" onClick={onExportBackup}>
          <Icon name="download" size={16} />
          {t('ดาวน์โหลดไฟล์สำรอง')}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} />
          {t('นำเข้าไฟล์สำรอง')}
        </button>
        <input
          ref={fileRef}
          type="file"
          id="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onImportBackup(f);
          }}
        />
      </div>

      <p className="hint">
        {t(
          'ข้อมูลธุรกิจเก็บในฐานข้อมูลออนไลน์เท่านั้น ไม่เก็บในเบราว์เซอร์ ไม่มีปุ่มรีเซ็ตข้อมูล เพื่อป้องกันการลบข้อมูลทั้งหมดโดยไม่ตั้งใจ'
        )}
      </p>

      {isAdmin && (
        <>
          {usersLoading ? (
            <>
              <h2>{t('จัดการผู้ใช้')}</h2>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="spin" aria-hidden="true" />
                <p className="hint" style={{ margin: 0 }}>{t('กำลังโหลด…')}</p>
              </div>
            </>
          ) : usersError ? (
            <>
              <h2>{t('จัดการผู้ใช้')}</h2>
              <div className="card">
                <b>{t('โหลดรายชื่อผู้ใช้ไม่ได้')}</b>
                <p className="hint">{usersError}</p>
                {onReloadUsers && (
                  <div className="row">
                    <button type="button" onClick={onReloadUsers}>
                      {t('โหลดใหม่')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h2>
                {t('จัดการผู้ใช้')} ({sortedUsers.length}
                {pendingCount ? ` · ${t('รออนุมัติ')} ${pendingCount}` : ''})
              </h2>
              <div className="card" style={{ padding: '4px 14px' }}>
                {sortedUsers.map((p, idx) => {
                  const [sl, sc] = STATUS_MAP[p.status] || STATUS_MAP.pending;
                  const isMe = currentUser && p.id === currentUser.id;
                  return (
                    <div
                      key={p.id}
                      className="row"
                      style={{
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 0',
                        borderBottom:
                          idx < sortedUsers.length - 1 ? '1px solid var(--line)' : 'none',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <b>{p.name || '-'}</b>
                        {isMe && <span className="hint"> ({t('คุณ')})</span>}
                        <div className="hint">{p.email}</div>
                      </div>
                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <span className={`pill ${sc}`}>{t(sl)}</span>
                        {p.role === 'admin' && <span className="pill">{t('ผู้ดูแล')}</span>}
                        <button type="button" onClick={() => onOpenUserModal(p)}>
                          {t('รายละเอียด')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <h2>{t('ประวัติการแก้ไขล่าสุด')}</h2>
      {audit.length ? (
        <div className="card scroll">
          <table className="check-table">
            <thead>
              <tr>
                <th>{t('เวลา')}</th>
                <th className="col-text">{t('รหัส')}</th>
                <th className="col-text">{t('ช่อง')}</th>
                <th>{t('เดิม')}</th>
                <th>{t('ใหม่')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, idx) => (
                <tr key={a.id || idx}>
                  <td>
                    {new Date(a.ts).toLocaleString(lang === 'en' ? 'en-GB' : 'th-TH', {
                      timeZone: 'Asia/Bangkok',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="col-text">{a.code}</td>
                  <td className="col-text">{a.field}</td>
                  <td>{String(a.from ?? '')}</td>
                  <td>{String(a.to ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{t('ยังไม่มีประวัติ')}</div>
      )}
    </div>
  );
};
