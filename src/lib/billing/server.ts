import 'server-only';
import { getBillingProvider } from '../providers/billing';
import { getSupabaseAdmin } from '../supabase/admin';
import { SupabaseBillingStore } from './supabase-billing-store';
import type { BillingDeps } from './sync';

export function getBillingDeps(): BillingDeps {
  return {
    provider: getBillingProvider(),
    store: new SupabaseBillingStore(getSupabaseAdmin),
    logger: {
      warn: (message, context) => console.warn(JSON.stringify({ level: 'warn', message, ...context })),
      error: (message, context) => console.error(JSON.stringify({ level: 'error', message, ...context })),
    },
  };
}
