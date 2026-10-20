import { createHmac } from 'node:crypto';

// Signed fail-open URL for a number's VoiceFallbackUrl (DESIGN_NOTES §6, Alternative A).
// The worker recomputes HMAC_SHA256(to, secret) and refuses to bridge anywhere else, so the
// public URL can't be reused to dial arbitrary (toll) destinations.
export function buildFailOpenUrl(
  forwardToNumber: string,
  config: { workerUrl?: string; signingSecret?: string }
): string | undefined {
  if (!config.workerUrl || !config.signingSecret) return undefined;
  const sig = createHmac('sha256', config.signingSecret).update(forwardToNumber).digest('hex');
  const url = new URL(config.workerUrl);
  url.searchParams.set('to', forwardToNumber);
  url.searchParams.set('sig', sig);
  return url.toString();
}
