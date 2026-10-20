import { serverEnv } from '@/lib/config/env';
import { getBillingDeps } from '@/lib/billing/server';
import { handleBillingWebhook } from '@/lib/billing/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe Dashboard → Developers → Webhooks: point at /api/stripe/webhook and subscribe to
// checkout.session.completed and customer.subscription.{created,updated,deleted,paused,resumed}.
export async function POST(request: Request) {
  // Signature verification needs the exact raw body; never parse it as JSON first.
  const payload = await request.text();
  try {
    const result = await handleBillingWebhook(
      payload,
      request.headers.get('stripe-signature'),
      serverEnv.stripeWebhookSecret(),
      getBillingDeps()
    );
    return new Response(result.body, { status: result.status });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Stripe webhook setup failed', error: String(err) }));
    return new Response('retry', { status: 500 });
  }
}
