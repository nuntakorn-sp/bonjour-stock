-- User management via direct RLS + RPC (แทน Edge Function admin-users)
-- รันไฟล์นี้ใน Supabase SQL Editor หลังจาก schema.sql + profiles ตั้งค่าเรียบร้อย

-- ===== helper: current user is admin? =====

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ===== profiles policies =====
-- - ทุกคนอ่าน row ของตัวเองได้
-- - admin อ่าน + แก้ของคนอื่นได้
-- - ตัวเองแก้ข้อมูลตัวเองได้ (name ฯลฯ) แต่ห้ามเปลี่ยน role/status ตัวเอง → trigger กันอีกชั้น

drop policy if exists "self read profile" on public.profiles;
drop policy if exists "admin read all profiles" on public.profiles;
drop policy if exists "admin update profiles" on public.profiles;
drop policy if exists "self update own profile" on public.profiles;
drop policy if exists "admin insert profile" on public.profiles;

create policy "self read profile" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "admin update profiles" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "self update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ===== RPC: list_users (admin only) =====
-- ให้ admin เรียกดูทั้ง email + name + role + status ในครั้งเดียว
-- ใช้ security definer เพื่ออ่าน auth.users ได้

create or replace function public.list_users()
returns table (
  id uuid,
  email text,
  name text,
  role text,
  status text,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;
  return query
    select p.id,
           u.email::text,
           coalesce(u.raw_user_meta_data->>'name', '-')::text as name,
           p.role,
           p.status,
           coalesce(p.must_change_password, false)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by (p.role = 'admin') desc, u.created_at asc;
end;
$$;

grant execute on function public.list_users() to authenticated;

-- ===== RPC: approve / reject (admin only shortcut) =====
-- client อาจจะเรียก update profiles ตรงก็ได้ แต่ RPC นี้ cover case เผื่อ

create or replace function public.set_user_status(
  target_id uuid,
  new_status text,
  new_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;
  if new_status not in ('approved', 'pending', 'rejected') then
    raise exception 'invalid status: %', new_status using errcode = '22023';
  end if;
  update public.profiles
     set status = new_status,
         role = coalesce(new_role, role)
   where id = target_id;
end;
$$;

grant execute on function public.set_user_status(uuid, text, text) to authenticated;

-- ===== RPC: delete_user (admin soft-delete) =====
-- เนื่องจากเราไม่มี service role จาก client เราไม่สามารถลบจาก auth.users ได้
-- แต่สามารถ mark เป็น rejected + ลบ profile ได้ (ผู้ใช้จะล็อกอินไม่ผ่าน approval check)

create or replace function public.soft_delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;
  if target_id = auth.uid() then
    raise exception 'cannot delete yourself' using errcode = '22023';
  end if;
  update public.profiles
     set status = 'rejected'
   where id = target_id;
end;
$$;

grant execute on function public.soft_delete_user(uuid) to authenticated;
