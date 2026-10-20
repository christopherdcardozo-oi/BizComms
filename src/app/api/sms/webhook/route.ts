import { handleInboundSms } from '@/lib/sms/handlers';
import { buildMessagingTwiML } from '@/lib/twilio/messaging-twiml';
import { runTwilioWebhook, twimlResponse } from '@/lib/twilio/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Configure as the Messaging Service (or number) "A message comes in" webhook, HTTP POST.
// A crash still acknowledges with empty TwiML; the failure is logged for follow-up.
export async function POST(request: Request) {
  return runTwilioWebhook(request, handleInboundSms, () => twimlResponse(buildMessagingTwiML(), 500));
}
