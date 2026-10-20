import { handleSmsStatus } from '@/lib/sms/handlers';
import { runTwilioWebhook } from '@/lib/twilio/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return runTwilioWebhook(request, handleSmsStatus, () => new Response(null, { status: 500 }));
}
