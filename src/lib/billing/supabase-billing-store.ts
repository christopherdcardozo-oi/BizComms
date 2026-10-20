import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingStore } from './sync';

// Service-role only: billing columns are not client-writable (migration 20261022000000).
// Connects lazily so the webhook verifies Stripe's signature before touching the database.
export class SupabaseBillingStore implements BillingStore {
  constructor(private connect: () => SupabaseClient) {}

  private get admin(): SupabaseClient {
    return this.connect();
  }

  async applySubscription(
    organizationId: string,
    state: { customerId: string; subscriptionId: string; priceId: string | null; status: string }
  ): Promise<boolean> {
    const { data, error } = await this.admin
      .from('organizations')
      .update({
        stripe_customer_id: state.customerId,
        stripe_subscription_id: state.subscriptionId,
        stripe_price_id: state.priceId,
        subscription_status: state.status,
      })
      .eq('id', organizationId)
      .select('id');
    if (error) throw new Error(`applySubscription: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async findOrganizationByCustomer(customerId: string): Promise<string | null> {
    if (!customerId) return null;
    const { data, error } = await this.admin.from('organizations').select('id').eq('stripe_customer_id', customerId).maybeSingle();
    if (error) throw new Error(`findOrganizationByCustomer: ${error.message}`);
    return (data as { id: string } | null)?.id ?? null;
  }

  async beginEvent(eventId: string): Promise<'new' | 'duplicate'> {
    const { data, error } = await this.admin
      .from('webhook_events')
      .upsert({ provider: 'stripe', event_id: eventId }, { onConflict: 'provider,event_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`beginEvent: ${error.message}`);
    if ((data ?? []).length > 0) return 'new';
    const existing = await this.admin
      .from('webhook_events')
      .select('processed_at')
      .eq('provider', 'stripe')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existing.error) throw new Error(`beginEvent lookup: ${existing.error.message}`);
    // Recorded but never completed (crashed mid-way): reprocess; syncing is idempotent.
    return (existing.data as { processed_at: string | null } | null)?.processed_at ? 'duplicate' : 'new';
  }

  async completeEvent(eventId: string): Promise<void> {
    const { error } = await this.admin
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', 'stripe')
      .eq('event_id', eventId);
    if (error) throw new Error(`completeEvent: ${error.message}`);
  }
}
