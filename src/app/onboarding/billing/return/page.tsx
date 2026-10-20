import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getBillingDeps } from '@/lib/billing/server';
import { syncCheckoutSession } from '@/lib/billing/sync';

// Stripe Checkout success_url. A page (not a route handler) so it works both for the full-page
// return from Stripe and for same-origin redirects from a server action (test-mode billing),
// which the client router fetches as a React Server Component. Syncs the subscription right
// away so the customer can continue without waiting for the webhook.
export default async function CheckoutReturnPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const session = await requireUser();
  if (!session.organizationId) redirect('/onboarding');

  const { session_id: sessionId } = await searchParams;
  let destination = '/onboarding';
  if (sessionId && /^cs_[A-Za-z0-9_-]+$/.test(sessionId)) {
    try {
      const result = await syncCheckoutSession(sessionId, session.organizationId, getBillingDeps());
      if (result === 'not_complete') destination = '/onboarding?checkout=pending';
    } catch (err) {
      // The webhook still delivers the subscription; the plan step shows "pending" meanwhile.
      console.error(JSON.stringify({ level: 'error', message: 'Checkout return sync failed', error: String(err) }));
      destination = '/onboarding?checkout=pending';
    }
  }
  redirect(destination);
}
