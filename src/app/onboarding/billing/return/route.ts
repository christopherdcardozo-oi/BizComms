import { NextResponse, type NextRequest } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { getBillingDeps } from '@/lib/billing/server';
import { syncCheckoutSession } from '@/lib/billing/sync';

// Stripe Checkout success_url. Syncs the subscription right away so the customer can buy a
// number without waiting for the webhook; the webhook remains the source of truth afterwards.
export async function GET(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.redirect(new URL('/login?next=/onboarding', request.url));
  if (!session.organizationId) return NextResponse.redirect(new URL('/onboarding', request.url));

  const sessionId = request.nextUrl.searchParams.get('session_id');
  if (sessionId && /^cs_[A-Za-z0-9_-]+$/.test(sessionId)) {
    try {
      const result = await syncCheckoutSession(sessionId, session.organizationId, getBillingDeps());
      if (result === 'not_complete') return NextResponse.redirect(new URL('/onboarding?checkout=pending', request.url));
    } catch (err) {
      // The webhook will still deliver the subscription; the plan step shows "pending" meanwhile.
      console.error(JSON.stringify({ level: 'error', message: 'Checkout return sync failed', error: String(err) }));
      return NextResponse.redirect(new URL('/onboarding?checkout=pending', request.url));
    }
  }
  return NextResponse.redirect(new URL('/onboarding', request.url));
}
