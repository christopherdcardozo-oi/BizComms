import { handleDialAction } from '@/lib/telephony/handlers';
import { runTwilioWebhook, twimlResponse } from '@/lib/twilio/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The caller may still be on the line and Twilio does not use VoiceFallbackUrl for <Dial action>,
// so even a crash must answer with valid TwiML rather than "an application error has occurred".
export async function POST(request: Request) {
  const leg = new URL(request.url).searchParams.get('leg') === 'ai' ? 'ai' : 'forward';
  return runTwilioWebhook(
    request,
    (params, deps) => handleDialAction(params, leg, deps),
    (deps) =>
      twimlResponse(
        deps?.telephony.buildHangupTwiML("Sorry, we can't take your call right now. Please try again shortly.") ??
          '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
      )
  );
}
