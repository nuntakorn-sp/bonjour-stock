-- BONJOUR stock sync schema
-- รันไฟล์นี้ใน Supabase SQL Editor (Project → SQL → New query)

-- ===== TABLES =====

create table if not exists public.stock_items (
  code text primary key,
  name text,
  name_en text,
  cat text,
  cat_en text,
  kind text,
  unit text,
  price numeric,
  cost numeric,
  spec text,
  carry numeric default 0,
  actual numeric default 0,
  out_qty numeric default 0,
  sold numeric default 0,
  broken numeric default 0,
  recv numeric default 0,
  counted boolean default false,
  deleted boolean default false,
  sample boolean default false,
  match_prev jsonb,
  waste_breakdown jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.current_shift (
  branch text primary key,
  date date,
  cash numeric default 0,
  qr numeric default 0,
  pos numeric,
  float_amt numeric default 0,
  float_end numeric,
  locked boolean default false,
  expenses jsonb default '[]'::jsonb,
  counter_name text,
  counter_title text,
  target_sales numeric,
  target_customers numeric,
  target_per_bill numeric,
  updated_at timestamptz default now()
);

create table if not exists public.daily_records (
  date date primary key,
  closed boolean default false,
  sold numeric,
  gross numeric,
  cash numeric,
  qr numeric,
  exp numeric,
  remit numeric,
  broken numeric,
  loss_val numeric,
  cats jsonb,
  nets jsonb,
  sys jsonb,
  pos_ok boolean,
  by_user text,
  sample boolean,
  counter_name text,
  counter_title text,
  target_sales numeric,
  target_customers numeric,
  target_per_bill numeric,
  created_at timestamptz default now()
);

create table if not exists public.receipts (
  id text primary key,
  date date,
  ts bigint,
  src text,
  file_name text,
  photo text,
  lines jsonb,
  created_at timestamptz default now()
);

create table if not exists public.audit_log (
  id text primary key,
  ts bigint,
  by_user text,
  code text,
  field text,
  from_val text,
  to_val text,
  why text,
  created_at timestamptz default now()
);

create table if not exists public.variances (
  id text primary key,
  date date,
  code text,
  name text,
  carry numeric,
  actual numeric,
  diff numeric,
  value numeric,
  status text default 'pending',
  note text,
  resolved_by text,
  resolved_at bigint,
  ts bigint,
  updated_at timestamptz default now()
);

create table if not exists public.sale_lines (
  id text primary key,
  date date,
  code text,
  type_id text,
  qty numeric,
  unit_price numeric,
  unit_cost numeric,
  amount numeric,
  ts bigint,
  created_at timestamptz default now()
);

-- ===== REALTIME =====

alter publication supabase_realtime add table public.stock_items;
alter publication supabase_realtime add table public.current_shift;
alter publication supabase_realtime add table public.daily_records;
alter publication supabase_realtime add table public.receipts;
alter publication supabase_realtime add table public.audit_log;
alter publication supabase_realtime add table public.variances;
alter publication supabase_realtime add table public.sale_lines;

-- ===== ROW LEVEL SECURITY =====
-- ผู้ใช้ที่ล็อกอิน (authenticated) มีสิทธิอ่าน/เขียนทุกตารางด้านบน
-- ปรับให้เข้มขึ้นได้ภายหลัง (เช่น ให้ admin เท่านั้นลบได้)

alter table public.stock_items    enable row level security;
alter table public.current_shift  enable row level security;
alter table public.daily_records  enable row level security;
alter table public.receipts       enable row level security;
alter table public.audit_log      enable row level security;
alter table public.variances      enable row level security;
alter table public.sale_lines     enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'stock_items','current_shift','daily_records',
      'receipts','audit_log','variances','sale_lines'
    ])
  loop
    execute format('drop policy if exists "auth read %1$s" on public.%1$I;', t);
    execute format('drop policy if exists "auth write %1$s" on public.%1$I;', t);
    execute format(
      'create policy "auth read %1$s" on public.%1$I for select to authenticated using (true);',
      t
    );
    execute format(
      'create policy "auth write %1$s" on public.%1$I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
