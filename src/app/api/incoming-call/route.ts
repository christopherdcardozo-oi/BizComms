import { handleIncomingCall } from '@/lib/telephony/handlers';
import { runTwilioWebhook } from '@/lib/twilio/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Any unexpected failure returns 503 so Twilio immediately retries against the number's
// VoiceFallbackUrl (the independent edge fail-open worker) instead of playing an error.
export async function POST(request: Request) {
  return runTwilioWebhook(request, handleIncomingCall, () => new Response(null, { status: 503 }));
}
