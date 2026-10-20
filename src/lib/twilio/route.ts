import 'server-only';
import { after } from 'next/server';
import { getTelephonyDeps } from '../telephony/deps';
import type { TelephonyDeps, WebhookResponse } from '../telephony/types';
import { verifyTwilioWebhook } from './validate';

const xml = (twiml: string, status = 200) =>
  new Response(twiml, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });

// Shared shell for Twilio voice webhooks: build deps, verify the signature, run the handler,
// defer background work to after(), and map unexpected failures to the route's own policy
// (`onFailure`) because "what the caller hears on a crash" differs per route.
export async function runTwilioWebhook(
  request: Request,
  handler: (params: Record<string, string>, deps: TelephonyDeps) => Promise<WebhookResponse>,
  onFailure: (deps: TelephonyDeps | null) => Response
): Promise<Response> {
  let deps: TelephonyDeps;
  try {
    deps = getTelephonyDeps();
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Telephony deps unavailable', error: String(err) }));
    return onFailure(null);
  }

  const verified = await verifyTwilioWebhook(request, deps.telephony);
  if (!verified.ok) {
    deps.logger.warn('Rejected Twilio webhook', { status: verified.status, path: new URL(request.url).pathname });
    return new Response(null, { status: verified.status });
  }

  try {
    const result = await handler(verified.params, deps);
    if (result.background) after(result.background);
    return result.twiml ? xml(result.twiml, result.status) : new Response(null, { status: result.status });
  } catch (err) {
    deps.logger.error('Twilio webhook handler threw', { path: new URL(request.url).pathname, error: String(err) });
    return onFailure(deps);
  }
}

export const twimlResponse = xml;
