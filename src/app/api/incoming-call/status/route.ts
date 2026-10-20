import { handleCallStatus } from '@/lib/telephony/handlers';
import { runTwilioWebhook } from '@/lib/twilio/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return runTwilioWebhook(request, handleCallStatus, () => new Response(null, { status: 500 }));
}
