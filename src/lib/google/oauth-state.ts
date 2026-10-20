import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// OAuth "state": binds the Google consent round-trip to the organization and browser that
// started it. Signed with HMAC and also stored in an httpOnly cookie, so a callback can't be
// replayed for another org or forged by a third party (CSRF on account linking).
const TTL_MS = 10 * 60_000;

export interface OAuthStatePayload {
  organizationId: string;
  nonce: string;
  expiresAt: number;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createOAuthState(organizationId: string, secret: string, now = Date.now()): string {
  const payload: OAuthStatePayload = { organizationId, nonce: randomBytes(16).toString('base64url'), expiresAt: now + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyOAuthState(state: string, cookieState: string | undefined, secret: string, now = Date.now()): OAuthStatePayload | null {
  if (!state || !cookieState || state.length !== cookieState.length) return null;
  if (!timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) return null;
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = sign(body, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    return payload.expiresAt > now ? payload : null;
  } catch {
    return null;
  }
}
