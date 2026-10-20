import { webhookUrl } from '../config/env';
import { ITelephonyProvider } from '../providers/telephony/types';

export type TwilioWebhookResult =
  | { ok: true; params: Record<string, string>; url: string }
  | { ok: false; status: 400 | 403 };

// Parses Twilio's form-encoded POST and verifies X-Twilio-Signature (DESIGN_NOTES §3).
// The signed URL is rebuilt from TWILIO_WEBHOOK_BASE_URL plus the request path and query,
// because Twilio signs the public URL it called, not whatever host a proxy or tunnel forwards.
export async function verifyTwilioWebhook(
  request: Request,
  telephony: ITelephonyProvider
): Promise<TwilioWebhookResult> {
  let params: Record<string, string>;
  try {
    const body = new URLSearchParams(await request.text());
    params = Object.fromEntries(body.entries());
  } catch {
    return { ok: false, status: 400 };
  }

  const incoming = new URL(request.url);
  const url = webhookUrl(`${incoming.pathname}${incoming.search}`);
  const signature = request.headers.get('x-twilio-signature') ?? '';

  if (!telephony.verifyWebhookSignature(url, params, signature)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, params, url };
}
