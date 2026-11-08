# 🥐 BONJOUR นับสต๊อกสินค้า

ระบบนับสต๊อกสินค้า รับของ การเงิน รายงาน และปิดกะสำหรับร้านเบเกอรี่ BONJOUR

- **Web App** ทำงานบน browser ทุกเครื่อง (desktop + mobile)
- **Realtime sync** ระหว่างทุกเครื่องที่ล็อกอิน (ผ่าน Supabase)
- **AI อ่านใบรับของ** (Google Gemini) — ลากรูปใบส่งของ/Excel ให้ AI อ่านแทน
- **Multi-user** — admin อนุมัติพนักงาน + reset password ผ่านลิงก์อีเมล

![screenshot](public/bonjour-logo.png)

---

## 🚀 Quick Start

### รับโปรเจคต่อ (แบบใช้ของเดิม)

```powershell
cd D:\path\to\bonjour-stock
npm install
copy .env.example .env.local
# แก้ค่าใน .env.local ให้ตรงกับที่ได้รับ
npm run dev
```

เปิด http://localhost:3000

### สร้างใหม่ (ไม่มีอะไรเลย)

ดูขั้นตอนเต็มใน **[SETUP.md](SETUP.md)** (~15 นาที)

---

## 📚 เอกสาร

| ไฟล์ | เนื้อหา |
| --- | --- |
| **[SETUP.md](SETUP.md)** | ติดตั้ง · รับโปรเจคต่อ · ตั้ง Supabase · ตั้ง SMTP · รัน server |
| **[USAGE.md](USAGE.md)** | คู่มือใช้งานทุก tab · ปิดกะ · tips |
| **[supabase/schema.sql](supabase/schema.sql)** | Database schema |
| **[supabase/users_rls.sql](supabase/users_rls.sql)** | RLS policies + RPC functions |

---

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- **Backend**: Express + Supabase (PostgreSQL + Auth + Realtime)
- **AI**: Google Gemini (`@google/genai`)
- **Email**: Resend SMTP (optional)

---

## 📜 Scripts

| คำสั่ง | หน้าที่ |
| --- | --- |
| `npm run dev` | รัน dev server (http://localhost:3000) |
| `npm run build` | Build production bundle → `dist/` |
| `npm start` | รัน production server |
| `npm run lint` | Type check (`tsc --noEmit`) |
| `npm run clean` | ลบ `dist/` + `server.js` |

---

## 🔐 Security

- **ห้าม commit** `.env.local` — มี secrets (Supabase key, Gemini key)
- Supabase **anon key** เปิดเผยได้ตามปกติ แต่ **ต้องตั้ง RLS ครบทุกตาราง** (สคริปต์ `users_rls.sql` ตั้งให้แล้ว)
- การจัดการ user ใช้ **direct query + RLS** ไม่ใช่ service role ใน client
- Admin reset password ผ่าน **อีเมลลิงก์** ไม่เห็นรหัสผ่านใหม่

---

## 📦 Project structure

```
bonjour-stock/
├─ src/
│  ├─ App.tsx                   # Root — state, sync, routing
│  ├─ main.tsx
│  ├─ types.ts                  # TS interfaces
│  ├─ index.css                 # Design tokens + styles
│  ├─ components/               # UI per tab
│  │  ├─ AuthView.tsx           # Login / signup / forgot password
│  │  ├─ StockView.tsx          # นับสต๊อก
│  │  ├─ ReceiveView.tsx        # รับของ (+ AI)
│  │  ├─ CashView.tsx           # การเงิน
│  │  ├─ ReportView.tsx         # รายงาน + กราฟ
│  │  ├─ SettingsView.tsx       # ตั้งค่า + user mgmt
│  │  └─ Modals.tsx             # Modal รวม (keypad, confirm, ...)
│  ├─ data/seedData.ts          # Initial seed (46 ขนม + 26 วัตถุดิบ)
│  └─ utils/
│     ├─ calculations.ts        # คำนวณ net/diff ฯลฯ
│     ├─ i18n.ts                # แปล TH ↔ EN
│     ├─ supabase.ts            # Supabase client + adm() helper
│     ├─ sync.ts                # Load snapshot + realtime subscriptions
│     └─ useRemoteSync.ts       # Hook รวม 2-way sync
├─ supabase/
│  ├─ schema.sql                # Tables + Realtime + base RLS
│  └─ users_rls.sql             # RLS user policies + RPCs
├─ public/                      # Assets (logo, favicon)
├─ server.ts                    # Express + Vite middleware + /api/ai/read-receive
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ .env.example                 # Template (copy to .env.local)
├─ SETUP.md                     # 📖 Setup guide
├─ USAGE.md                     # 📖 User guide
└─ README.md                    # ← this file
```

---

## 🧪 Verification

```powershell
npm run lint
```

ไม่ขึ้น error = type check ผ่าน

---

## 🙏 Credits

- Original design: Google AI Studio
- Icons: Lucide
- Fonts: Anuphan (Google Fonts)

---

Made with 🥐 for a cozy bakery
