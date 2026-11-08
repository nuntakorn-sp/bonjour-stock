# คู่มือตั้งค่าโปรเจค BONJOUR (สำหรับแอดมินใหม่)

เอกสารนี้สำหรับผู้ที่ **เพิ่งรับโปรเจคต่อ** เพื่อนำไปใช้เอง มีทั้ง 2 แบบให้เลือก:

- **แบบ A — ใช้ Supabase + Resend ของเจ้าของเดิมต่อ** (เร็วสุด ไม่ต้องสร้างอะไร แต่ต้องขอสิทธิ์จากเจ้าของเดิม)
- **แบบ B — สร้างใหม่หมดเลย** (เป็นเจ้าของ 100% ไม่พึ่งใคร แนะนำสำหรับ production)

---

## 📋 สิ่งที่ต้องมีก่อนเริ่ม

| โปรแกรม | เวอร์ชัน | ลิงก์ติดตั้ง |
| --- | --- | --- |
| Node.js | 20+ | https://nodejs.org/ |
| Git (optional) | ล่าสุด | https://git-scm.com/ |

ตรวจว่าติดตั้งแล้วด้วยคำสั่ง (เปิด **PowerShell** หรือ **Command Prompt**):

```powershell
node --version
```

ถ้าไม่ขึ้น `v20.x.x` ขึ้นไป ให้ติดตั้ง Node.js ก่อน

---

# 🅰️ แบบ A — ใช้ของเจ้าของเดิมต่อ

ใช้ได้เมื่อ:
- เจ้าของเดิมเพิ่ม email คุณเข้าเป็น **Team Member** ใน Supabase แล้ว
- เจ้าของเดิมส่ง **Supabase URL + anon key + Resend API key** ให้คุณ
- เจ้าของเดิมสร้างบัญชี admin ใน Supabase Auth ให้คุณแล้ว (หรือจะให้คุณไปกด "ลืมรหัสผ่าน" เอา)

## ขั้นตอน

### 1. ติดตั้ง dependencies

เปิด PowerShell เข้าโฟลเดอร์โปรเจค:

```powershell
cd D:\path\to\bonjour-stock
npm install
```

รอ ~1 นาที

### 2. สร้างไฟล์ `.env.local`

copy จาก `.env.example`:

```powershell
copy .env.example .env.local
```

เปิดไฟล์ `.env.local` ด้วย Notepad หรือ VSCode แล้วแก้ค่าให้ตรงกับที่ได้รับ:

```ini
GEMINI_API_KEY="AIza..."
VITE_SUPABASE_URL="https://xxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGci..."
VITE_ADMIN_EMAIL="your_email@gmail.com"
```

> 💡 `GEMINI_API_KEY` เอาจาก https://aistudio.google.com/app/apikey (ฟรี) — ถ้ายังไม่ใช้ AI อ่านใบรับของ ปล่อยว่างได้

### 3. รันเซิร์ฟเวอร์

```powershell
npm run dev
```

เปิดเบราว์เซอร์ไปที่ http://localhost:3000

### 4. เปลี่ยนรหัสผ่านตัวเอง

1. ที่หน้า Login → กด **"ลืมรหัสผ่าน?"**
2. ใส่ email ของคุณ → **ส่งลิงก์**
3. เปิดกล่องเมล (รวม Spam) → กดลิงก์ → ตั้งรหัสผ่านใหม่

จบ ✅

---

# 🅱️ แบบ B — สร้างโปรเจคใหม่ของตัวเอง

ใช้เมื่อต้องการเป็นเจ้าของเต็มตัว ไม่พึ่งเจ้าของเดิม

## ขั้นตอน (รวม ~15 นาที)

### 1. สมัคร Supabase

1. ไป https://supabase.com/ → **Start your project** → ล็อกอินด้วย GitHub หรือ email
2. **New Project** → ตั้งชื่อ (เช่น `bonjour-stock`) → region **Singapore** → ตั้ง DB password (จดไว้) → **Create**
3. รอ ~2 นาทีให้ provision เสร็จ

### 2. ติดตั้งโปรเจค

```powershell
cd D:\path\to\bonjour-stock
npm install
copy .env.example .env.local
```

### 3. ใส่ Supabase credentials

ใน Supabase Dashboard → **Settings** → **API** → copy 2 ค่า:
- Project URL
- anon / public key

แก้ไฟล์ `.env.local`:

```ini
VITE_SUPABASE_URL="https://xxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGci..."
VITE_ADMIN_EMAIL="your_email@gmail.com"
```

### 4. รัน SQL Schema

ใน Supabase Dashboard → **SQL Editor** → **New query**

**สคริปต์ที่ 1** — copy ทั้งหมดจากไฟล์ `supabase/schema.sql` ในโปรเจค → paste → **Run**

**สคริปต์ที่ 2** — paste สคริปต์นี้แล้ว Run:

```sql
-- สร้าง profiles table + auto-trigger
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  status text default 'pending',
  role text default 'staff',
  must_change_password boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, status, role)
  values (new.id, 'pending', 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**สคริปต์ที่ 3** — copy จากไฟล์ `supabase/users_rls.sql` → paste → **Run**

### 5. สร้างบัญชี Admin ใน Supabase Auth

1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Email: อีเมลของคุณ (ให้ตรงกับ `VITE_ADMIN_EMAIL`)
3. Password: ตั้งอะไรก็ได้ที่จำได้
4. ☑ **Auto Confirm User**
5. **Create user**

### 6. อนุมัติบัญชี Admin

ใน SQL Editor รัน (แทน email):

```sql
insert into public.profiles (id, status, role)
select id, 'approved', 'admin'
from auth.users
where email = 'your_email@gmail.com'
on conflict (id) do update
set status = 'approved', role = 'admin';
```

### 7. ปิด "Confirm email" (สำหรับ staff สมัครได้เลย)

👉 Dashboard → **Authentication** → **Providers** → **Email** → ปิด toggle **"Confirm email"** → **Save**

### 8. ตั้งค่า SMTP (ส่งอีเมล reset password)

#### 8.1 สมัคร Resend
1. ไป https://resend.com/signup → สมัครด้วย email ตัวเอง
2. ยืนยัน email จาก Resend

#### 8.2 สร้าง API Key
1. Resend Dashboard → **API Keys** → **Create API Key**
2. Name: `supabase` → Permission: **Sending access** → **Add**
3. Copy key `re_...` (เห็นแค่ครั้งเดียว ให้จดไว้)

#### 8.3 ตั้งใน Supabase
👉 Supabase → **Authentication** → **Emails** → เปิด **Enable Custom SMTP** → กรอก:

| ช่อง | ค่า |
| --- | --- |
| Sender email | `onboarding@resend.dev` |
| Sender name | `BONJOUR` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | `re_...` (API key) |

**Save**

#### 8.4 เพิ่ม Rate Limit

👉 **Authentication** → **Rate Limits** → เพิ่ม **"Rate limit for sending emails"** จาก 2 → `30` per hour → **Save**

### 9. รันเซิร์ฟเวอร์

```powershell
npm run dev
```

เปิด http://localhost:3000 → กด **"ผู้ดูแล"** → ล็อกอินด้วย email + password ที่ตั้งไว้

---

# 🖥️ การรันเซิร์ฟเวอร์ (ใช้ซ้ำทุกครั้ง)

## เปิดใช้งาน

```powershell
cd D:\path\to\bonjour-stock
npm run dev
```

รอจน log ขึ้น:
```
Server running on http://0.0.0.0:3000
```

เปิดเบราว์เซอร์ไปที่ **http://localhost:3000**

## ปิดใช้งาน

กด **Ctrl+C** ที่หน้าต่าง PowerShell → ยืนยัน `Y`

## ใช้งานในเครื่องอื่น (เช่น มือถือ)

1. หา IP ของเครื่องที่รัน server:
   ```powershell
   ipconfig
   ```
   หา **IPv4 Address** ของ **Wireless LAN adapter Wi-Fi** (เช่น `192.168.1.10`)

2. บนมือถือ (ต้องอยู่ Wi-Fi เดียวกัน) เปิดเบราว์เซอร์:
   ```
   http://192.168.1.10:3000
   ```

3. ล็อกอินปกติ → ข้อมูลจะ sync กับเครื่องอื่นผ่าน Supabase อัตโนมัติ

> ⚠️ **ถ้าเข้าไม่ได้** อาจต้องเปิดพอร์ต 3000 ใน **Windows Firewall**:
> Settings → Network → Advanced → Inbound rules → New rule → Port 3000 → Allow

---

# 👥 การจัดการผู้ใช้งาน (Admin)

## ให้พนักงานสมัครเข้าระบบ

1. บอก URL แอปให้พนักงาน (http://IP:3000)
2. ที่หน้า Login พนักงานกด **"สมัครพนักงาน"**
3. กรอก ชื่อ-นามสกุล + email + password → **ส่งคำขอสมัคร**
4. พนักงานเห็นข้อความ "รอผู้ดูแลอนุมัติ"

## อนุมัติพนักงาน

1. Admin ล็อกอิน → tab **ตั้งค่า**
2. เลื่อนลงไปส่วน **จัดการผู้ใช้**
3. คลิกชื่อพนักงานที่ขึ้น `รออนุมัติ`
4. กด **อนุมัติ** → เสร็จ

## รีเซ็ตรหัสผ่านให้พนักงาน

ไม่ต้องตั้งให้แล้ว — ให้พนักงานกด "ลืมรหัสผ่าน?" ที่หน้า Login เอง

หรือ admin:
1. tab ตั้งค่า → คลิกชื่อพนักงาน
2. เลื่อนลง **รีเซ็ตรหัสผ่าน** → กด **ส่งลิงก์รีเซ็ตรหัสผ่าน**
3. ระบบส่งอีเมลให้พนักงาน

> ⚠️ **ข้อจำกัด Resend ฟรี**: Sender `onboarding@resend.dev` ส่งได้เฉพาะ email ของเจ้าของ Resend account เท่านั้น ถ้าจะส่งถึงพนักงานคนอื่น ต้อง verify domain ที่ Resend (`resend.com/domains`) หรืออัปเกรดเป็น paid tier

## เปลี่ยน role / ลบพนักงาน

ใน modal **ผู้ใช้งาน** → เปลี่ยน role หรือกด **ลบ** (soft delete → status = rejected)

---

# 🛠️ ปัญหาที่พบบ่อย

### "ซิงก์แล้ว" ไม่ขึ้นสีเขียว

- ตรวจ `.env.local` ว่าใส่ URL + anon key ถูก
- ตรวจว่ารัน SQL schema ใน Supabase เรียบร้อย
- Reload หน้า

### ล็อกอินไม่ผ่าน "บัญชียังไม่ได้รับการอนุมัติ"

- รัน SQL approve อีกรอบ (ข้อ 6)

### Email reset ไม่เข้า

- ตรวจ gmail spam/junk
- ตรวจ Supabase **Auth Logs** ว่าส่งจริงไหม
- ตรวจว่า email ปลายทาง = เจ้าของ Resend account (ถ้ายังใช้ `onboarding@resend.dev`)

### หน้าแอปโหลดช้า / ขาวเปล่า

- F12 เปิด DevTools → tab Console ดู error
- ตรวจว่า dev server ยังรันอยู่

### แก้ตัวเลขแล้วไม่ sync ไปเครื่องอื่น

- ตรวจ pill มุมขวาบนว่า "ซิงก์แล้ว" ไหม
- ตรวจ Supabase → Table Editor → `stock_items` ว่ามี row อัปเดตจริง
- Reload เบราว์เซอร์ทุกเครื่อง

---

# 📞 ติดต่อ

หากติดตรงไหน:

- **README.md** — ภาพรวมโปรเจค
- **USAGE.md** — วิธีใช้งานรายวัน
- **supabase/schema.sql** — schema database
- **supabase/users_rls.sql** — user management SQL

---

**Build**: Vite + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Gemini AI
