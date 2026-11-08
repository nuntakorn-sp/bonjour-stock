import React, { useState, useRef, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Icon } from './Icons';
import { UserProfile } from '../types';
import {
  sb,
  ADMIN_EMAIL,
  LS,
  isAdminEmail,
  isApprovedUser,
  adm,
  userToProfile,
} from '../utils/supabase';

interface AuthViewProps {
  onLogin: (user: UserProfile) => void;
  onRegisterStaff: (name: string, email: string) => void;
  t: (s: string) => string;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLogin, onRegisterStaff, t }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => LS('bj_email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean }>({ text: '' });

  // Set-new-password modal state. Used for both:
  //  (a) admin-issued temporary passwords (must_change_password flag), and
  //  (b) "ลืมรหัสผ่าน" email-link recovery flow (Supabase PASSWORD_RECOVERY event)
  const [pendingChangeUser, setPendingChangeUser] = useState<User | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPw1, setNewPw1] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [changeErr, setChangeErr] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Detect PASSWORD_RECOVERY event — fires when user lands here via reset email link
  useEffect(() => {
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setPendingChangeUser(session.user);
        setRecoveryMode(true);
        setNewPw1('');
        setNewPw2('');
        setChangeErr('');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const cardRef = useRef<HTMLFormElement>(null);
  const prevHeightRef = useRef<number>(0);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const pwInputRef = useRef<HTMLInputElement>(null);

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  // Focus appropriate input on mode change (matches reference line 639)
  useEffect(() => {
    const target = isSignup
      ? nameInputRef.current
      : isForgot
      ? emailInputRef.current
      : email
      ? pwInputRef.current
      : emailInputRef.current;
    target?.focus();
  }, [mode]);

  // Animate card height and staggered children on mode swap (matches reference lines 628-638)
  const handleSwitchMode = (nextMode: 'login' | 'signup' | 'forgot') => {
    if (nextMode === mode) return;
    const card = cardRef.current;
    if (card) {
      prevHeightRef.current = card.getBoundingClientRect().height;
    }
    setSwapping(true);
    setMode(nextMode);
    setMsg({ text: '' });
  };

  useEffect(() => {
    if (!swapping || !cardRef.current) return;
    const card = cardRef.current;
    const oldH = prevHeightRef.current;
    const newH = card.getBoundingClientRect().height;
    if (
      oldH &&
      Math.abs(newH - oldH) > 1 &&
      typeof card.animate === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      card.style.overflow = 'hidden';
      const anim = card.animate([{ height: `${oldH}px` }, { height: `${newH}px` }], {
        duration: 500,
        easing: 'cubic-bezier(.2,.7,.2,1)',
      });
      anim.onfinish = () => {
        card.style.overflow = '';
      };
    }
    const children = Array.from(card.children) as HTMLElement[];
    children.forEach((c, i) => {
      c.style.animationDelay = `${i * 45}ms`;
    });
    const doneMs = Math.min(children.length * 45 + 700, 1500);
    const timer = setTimeout(() => {
      setSwapping(false);
      children.forEach((c) => {
        c.style.animationDelay = '';
      });
    }, doneMs);
    return () => clearTimeout(timer);
  }, [mode, swapping]);

  // Exact doAuth() port from reference app (lines 641-670)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim();
    const pw = password;
    const say = (text: string, ok?: boolean) => setMsg({ text: t(text), ok });

    if (!sb) {
      say('ยังเชื่อมต่อระบบไม่ได้ ลองรีเฟรชหน้านี้');
      return;
    }

    if (isForgot) {
      if (!em) {
        say('กรอกอีเมลเพื่อรับลิงก์รีเซ็ต');
        return;
      }
      setBusy(true);
      setMsg({ text: '' });
      try {
        const redirectTo = `${window.location.origin}/?login=1`;
        const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo });
        if (error) throw error;
        LS('bj_email', em);
        say('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณแล้ว กรุณาตรวจกล่องขาเข้าหรือ Spam', true);
      } catch (err) {
        say(
          err instanceof Error
            ? `ส่งลิงก์ไม่สำเร็จ: ${err.message}`
            : 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง'
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!em || !pw) {
      say('กรอกอีเมลและรหัสผ่านให้ครบ');
      return;
    }

    setBusy(true);
    setMsg({ text: '' });
    try {
      if (isSignup) {
        const nm = name.trim();
        if (!nm) {
          say('กรอกชื่อ-นามสกุล');
          return;
        }
        if (pw.length < 6) {
          say('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
          return;
        }
        if (pw !== confirmPassword) {
          say('รหัสผ่านสองช่องไม่ตรงกัน');
          return;
        }

        const { data, error } = await sb.auth.signUp({
          email: em,
          password: pw,
          options: {
            data: isAdminEmail(em) ? { name: nm } : { name: nm, status: 'pending' },
          },
        });

        if (error) {
          say(
            /registered|exists/i.test(error.message)
              ? 'อีเมลนี้สมัครไว้แล้ว'
              : `${t('สมัครไม่สำเร็จ: ')}${error.message}`
          );
          return;
        }

        onRegisterStaff(nm, em);

        if (isAdminEmail(em)) {
          LS('bj_email', em);
          if (data && data.session && data.user) {
            onLogin(userToProfile(data.user));
            return;
          }
          handleSwitchMode('login');
          say('สร้างบัญชีผู้ดูแลแล้ว หากระบบให้ยืนยันอีเมล โปรดยืนยันก่อนแล้วจึงเข้าสู่ระบบ', true);
          return;
        }

        if (data && data.session) {
          await sb.auth.signOut();
        }
        LS('bj_email', em);
        setPassword('');
        setConfirmPassword('');
        handleSwitchMode('login');
        say('ส่งคำขอแล้ว รอผู้ดูแลอนุมัติก่อนเข้าใช้งาน', true);
        return;
      }

      // Login mode
      const { data, error } = await sb.auth.signInWithPassword({
        email: em,
        password: pw,
      });

      if (error || !data.user) {
        say(
          /confirm/i.test(error?.message || '')
            ? 'อีเมลยังไม่ได้ยืนยัน'
            : 'เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน'
        );
        return;
      }

      const u = data.user;
      const { approved, profile } = await isApprovedUser(u);
      if (!approved) {
        await sb.auth.signOut();
        say('บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแล');
        return;
      }

      if (profile && profile.must_change_password) {
        setPendingChangeUser(u);
        setNewPw1('');
        setNewPw2('');
        setChangeErr('');
        return;
      }

      LS('bj_email', em);
      LS('bj_logged_out', null);
      onLogin(userToProfile(u, profile));
    } catch {
      say('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  // Prefill admin email so the operator only has to type the password.
  // No bypass: real Supabase auth still has to succeed.
  const handleQuickAdmin = () => {
    if (!ADMIN_EMAIL) return;
    setEmail(ADMIN_EMAIL);
    setPassword('');
    setMode('login');
    setMsg({ text: '' });
    setTimeout(() => pwInputRef.current?.focus(), 0);
  };

  // Force change password handler (matches reference forceChangePassword lines 563-569).
  // Reused for both admin-issued temporary passwords AND email-link recovery flow.
  const handleConfirmNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw1.length < 6) {
      setChangeErr(t('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'));
      return;
    }
    if (newPw1 !== newPw2) {
      setChangeErr(t('รหัสผ่านไม่ตรงกัน'));
      return;
    }
    setChangingPw(true);
    setChangeErr('');
    try {
      if (recoveryMode) {
        // Supabase PASSWORD_RECOVERY: just update password on the recovery session.
        const { error } = await sb.auth.updateUser({ password: newPw1 });
        if (error) throw error;
      } else {
        // Admin-issued temp password: also clears the must_change_password flag.
        await adm('clear_must_change', { password: newPw1 });
      }
      if (pendingChangeUser) {
        const { profile } = await isApprovedUser(pendingChangeUser);
        LS('bj_email', pendingChangeUser.email || email.trim());
        onLogin(userToProfile(pendingChangeUser, profile));
        setPendingChangeUser(null);
        setRecoveryMode(false);
      }
    } catch (err) {
      setChangeErr(
        `${t('ตั้งรหัสผ่านไม่สำเร็จ: ')}${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setChangingPw(false);
    }
  };

  const handleCancelNewPassword = async () => {
    setPendingChangeUser(null);
    setRecoveryMode(false);
    await sb.auth.signOut();
    setMsg({ text: t('ยังไม่ได้ตั้งรหัสผ่านใหม่'), ok: false });
  };

  return (
    <div className="auth-wrap" id="auth">
      <form
        ref={cardRef}
        className={`acard${swapping ? ' swap' : ''}`}
        onSubmit={handleSubmit}
        noValidate
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span className="logo lg" role="img" aria-label="BONJOUR" />
          <span className="brand" style={{ margin: 0 }}>
            BONJOUR
          </span>
        </div>

        <h1>
          {isForgot
            ? t('ลืมรหัสผ่าน')
            : isSignup
            ? t('ขอสมัครเป็นพนักงาน')
            : t('เข้าสู่ระบบ')}
        </h1>
        <p className="sub">
          {isForgot
            ? t('กรอกอีเมลเพื่อรับลิงก์รีเซ็ตรหัสผ่าน')
            : isSignup
            ? t('ส่งคำขอแล้วรอผู้ดูแลอนุมัติก่อนเข้าใช้งาน')
            : t('นับสต๊อกและปิดกะ')}
        </p>

        {!isForgot && (
          <div className="seg" role="group" aria-label={t('โหมด')}>
            <button
              type="button"
              data-a="am"
              data-v="login"
              aria-pressed={!isSignup}
              onClick={() => handleSwitchMode('login')}
            >
              {t('เข้าสู่ระบบ')}
            </button>
            <button
              type="button"
              data-a="am"
              data-v="signup"
              aria-pressed={isSignup}
              onClick={() => handleSwitchMode('signup')}
            >
              {t('สมัครพนักงาน')}
            </button>
          </div>
        )}

        {isSignup && (
          <>
            <label htmlFor="au-n">{t('ชื่อ-นามสกุล')}</label>
            <input
              ref={nameInputRef}
              type="text"
              id="au-n"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        )}

        <label htmlFor="au-e">{t('อีเมล')}</label>
        <input
          ref={emailInputRef}
          type="email"
          id="au-e"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {!isForgot && (
          <>
            <label htmlFor="au-p">{t('รหัสผ่าน')}</label>
            <div className="pw">
              <input
                ref={pwInputRef}
                type={showPw ? 'text' : 'password'}
                id="au-p"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                data-a="showpw"
                aria-label={t('แสดงหรือซ่อนรหัสผ่าน')}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? t('ซ่อน') : t('แสดง')}
              </button>
            </div>
          </>
        )}

        {isSignup && (
          <>
            <label htmlFor="au-p2">{t('ยืนยันรหัสผ่าน')}</label>
            <input
              type={showPw ? 'text' : 'password'}
              id="au-p2"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </>
        )}

        <button type="submit" className="pri go" id="au-go" data-a="authgo" disabled={busy}>
          {busy
            ? t('กำลังดำเนินการ…')
            : isForgot
            ? t('ส่งลิงก์รีเซ็ตรหัสผ่าน')
            : isSignup
            ? t('ส่งคำขอสมัคร')
            : t('เข้าสู่ระบบ')}
        </button>

        {!isForgot && (
          <button
            type="button"
            data-a="forgot"
            disabled={busy}
            onClick={() => handleSwitchMode('forgot')}
            style={{
              width: '100%',
              marginTop: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--mute)',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: '6px 0',
            }}
          >
            {t('ลืมรหัสผ่าน?')}
          </button>
        )}

        {isForgot && (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleSwitchMode('login')}
            style={{ width: '100%', marginTop: 8 }}
          >
            {t('กลับไปเข้าสู่ระบบ')}
          </button>
        )}

        {ADMIN_EMAIL && !isForgot && (
          <button
            type="button"
            data-a="adm"
            disabled={busy}
            onClick={handleQuickAdmin}
            style={{ width: '100%', marginTop: 8 }}
          >
            <Icon name="lock" size={16} /> {t('ผู้ดูแล')}
          </button>
        )}

        <p
          className={msg.ok ? 'hint' : 'errt'}
          id="au-m"
          role="alert"
          style={{ minHeight: 20, marginTop: 8 }}
        >
          {msg.text}
        </p>
      </form>

      {pendingChangeUser && (
        <div className="modal-backdrop">
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={t('ตั้งรหัสผ่านใหม่')}
            onSubmit={handleConfirmNewPassword}
          >
            <h2 style={{ marginTop: 0 }}>{t('ตั้งรหัสผ่านใหม่')}</h2>
            <p className="hint" style={{ whiteSpace: 'pre-line' }}>
              {recoveryMode
                ? t('ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ (อย่างน้อย 6 ตัวอักษร)')
                : t('ผู้ดูแลตั้งรหัสผ่านชั่วคราวให้คุณ\nกรุณาตั้งรหัสผ่านใหม่ของคุณเอง (อย่างน้อย 6 ตัวอักษร)')}
            </p>
            <label htmlFor="fc-p1">{t('รหัสผ่านใหม่')}</label>
            <input
              id="fc-p1"
              type="password"
              autoComplete="new-password"
              value={newPw1}
              onChange={(e) => setNewPw1(e.target.value)}
            />
            <label htmlFor="fc-p2" style={{ marginTop: 8 }}>
              {t('ยืนยันรหัสผ่านใหม่อีกครั้ง')}
            </label>
            <input
              id="fc-p2"
              type="password"
              autoComplete="new-password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
            />
            {changeErr && <p className="errt">{changeErr}</p>}
            <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancelNewPassword} disabled={changingPw}>
                {t('ยกเลิก')}
              </button>
              <button type="submit" className="pri" disabled={changingPw}>
                {changingPw ? t('กำลังดำเนินการ…') : t('บันทึกรหัสผ่านใหม่')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
