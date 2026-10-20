import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { UserRole } from '../../types/database.types';
import { createSupabaseServerClient } from '../supabase/server';

export interface SessionContext {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  organizationId: string | null;
  role: UserRole;
  organizationName: string | null;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
}

// Data-access-layer entry point: verifies the session with Supabase Auth (getUser, not the
// unverified cookie) and loads the caller's profile through RLS. Memoized per render pass.
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('organization_id, role, email, organizations(name, subscription_status, stripe_customer_id)')
    .eq('id', data.user.id)
    .maybeSingle();
  const row = profile as {
    organization_id: string | null;
    role: UserRole;
    email: string;
    organizations: { name: string; subscription_status: string | null; stripe_customer_id: string | null } | null;
  } | null;

  return {
    supabase,
    userId: data.user.id,
    email: row?.email ?? data.user.email ?? '',
    organizationId: row?.organization_id ?? null,
    role: row?.role ?? 'member',
    organizationName: row?.organizations?.name ?? null,
    subscriptionStatus: row?.organizations?.subscription_status ?? null,
    stripeCustomerId: row?.organizations?.stripe_customer_id ?? null,
  };
});

export async function requireUser(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  return session;
}

export async function requireOrganization(): Promise<SessionContext & { organizationId: string }> {
  const session = await requireUser();
  if (!session.organizationId) redirect('/onboarding');
  return session as SessionContext & { organizationId: string };
}

export function canManage(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}
