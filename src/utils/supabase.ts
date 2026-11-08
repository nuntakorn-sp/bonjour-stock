import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { UserProfile } from '../types';

export interface BonjourConfig {
  url: string;
  anonKey: string;
}

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!envUrl || !envKey) {
  // Surface misconfiguration early instead of silently falling through to an auth bypass.
  // The app will still render, but every Supabase call will fail.
  console.error(
    'Supabase config missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// Publishable anon key; access is controlled by Supabase RLS policies.
export const BONJOUR_CONFIG: BonjourConfig = {
  url: envUrl || 'https://invalid.supabase.co',
  anonKey: envKey || 'invalid',
};

export const ADMIN_EMAIL =
  (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.toLowerCase() || '';

export const sb: SupabaseClient = createClient(BONJOUR_CONFIG.url, BONJOUR_CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const LS = (k: string, v?: string | null): string | null => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) {
      localStorage.removeItem(k);
    } else {
      localStorage.setItem(k, v);
    }
    return null;
  } catch {
    return null;
  }
};

export const isAdminEmail = (e?: string | null): boolean =>
  Boolean(ADMIN_EMAIL && e && e.toLowerCase() === ADMIN_EMAIL.toLowerCase());

export const isAdminUser = (u?: User | null): boolean =>
  Boolean(
    u &&
      ((u.app_metadata && u.app_metadata.role === 'admin') ||
        (ADMIN_EMAIL && u.email && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()))
  );

export interface ProfileRow {
  status: 'approved' | 'pending' | 'rejected';
  role: 'admin' | 'staff';
  must_change_password?: boolean;
}

export async function getProfile(u?: User | null): Promise<ProfileRow | null> {
  if (!sb || !u) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('status,role,must_change_password')
    .eq('id', u.id)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileRow;
}

export async function isApprovedUser(
  u?: User | null
): Promise<{ approved: boolean; profile: ProfileRow | null }> {
  if (!u) return { approved: false, profile: null };
  const profile = await getProfile(u);
  if (isAdminUser(u)) {
    return { approved: true, profile };
  }
  return {
    approved: Boolean(profile && profile.status === 'approved'),
    profile,
  };
}

interface ListUsersRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  status: 'approved' | 'pending' | 'rejected';
  must_change_password: boolean;
}

/**
 * User-management client — replaces the old admin-users Edge Function with direct
 * RLS-guarded queries and security-definer RPCs. Same action names so call sites
 * don't change.
 *
 * Supported actions:
 *   - list                                     → { users: UserProfile[] }  (admin)
 *   - update   { id, status?, role?, name? }   → {}                         (admin for others; self for own name)
 *   - reset_password { email }                 → sends a reset-link email to that user
 *   - delete   { id }                          → {}                         (admin, soft-delete)
 *   - clear_must_change { password }           → {}                         (self)
 */
export async function adm<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  if (action === 'list') {
    const { data, error } = await sb.rpc('list_users');
    if (error) throw new Error(error.message);
    const users = (data as ListUsersRow[] | null)?.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name || '-',
      role: r.role,
      status: r.status,
      must_change_password: Boolean(r.must_change_password),
    })) || [];
    return { users } as unknown as T;
  }

  if (action === 'update') {
    const id = String(body.id || '');
    if (!id) throw new Error('missing id');
    const newStatus = body.status as string | undefined;
    const newRole = body.role as string | undefined;
    const newName = body.name as string | undefined;

    if (newStatus || newRole) {
      const { error } = await sb.rpc('set_user_status', {
        target_id: id,
        new_status: newStatus || null,
        new_role: newRole || null,
      });
      if (error) throw new Error(error.message);
    }

    // Updating own display name goes through auth metadata.
    const { data: session } = await sb.auth.getSession();
    if (newName && session?.session?.user?.id === id) {
      const { error } = await sb.auth.updateUser({ data: { name: newName } });
      if (error) throw new Error(error.message);
    }

    return {} as T;
  }

  if (action === 'reset_password') {
    const email = String(body.email || '');
    if (!email) throw new Error('missing email');
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/?login=1` : undefined;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
    return {} as T;
  }

  if (action === 'delete') {
    const id = String(body.id || '');
    if (!id) throw new Error('missing id');
    const { error } = await sb.rpc('soft_delete_user', { target_id: id });
    if (error) throw new Error(error.message);
    return {} as T;
  }

  if (action === 'clear_must_change') {
    const password = String(body.password || '');
    if (!password) throw new Error('missing password');
    const { error: pwErr } = await sb.auth.updateUser({ password });
    if (pwErr) throw new Error(pwErr.message);
    const { data: session } = await sb.auth.getSession();
    const uid = session?.session?.user?.id;
    if (uid) {
      const { error } = await sb
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', uid);
      if (error) throw new Error(error.message);
    }
    return {} as T;
  }

  throw new Error(`unknown adm action: ${action}`);
}

export function userToProfile(u: User, profile?: ProfileRow | null): UserProfile {
  const isAdm = isAdminUser(u) || profile?.role === 'admin';
  const metaName =
    (u.user_metadata && typeof u.user_metadata.name === 'string' && u.user_metadata.name) || '';
  return {
    id: u.id,
    email: u.email || '',
    name: metaName || '-',
    role: isAdm ? 'admin' : 'staff',
    status: isAdm ? 'approved' : profile?.status || 'approved',
    must_change_password: Boolean(profile?.must_change_password),
  };
}
