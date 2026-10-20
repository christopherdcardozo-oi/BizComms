import { createHash, timingSafeEqual } from 'node:crypto';

// Vapi server-URL auth: "Authorization: Bearer <token>" (recommended, via a Custom Credential)
// or the legacy "X-Vapi-Secret: <token>". Constant-time; fails closed without a secret.
export function isAuthorizedVapiRequest(
  headers: { get(name: string): string | null },
  secret: string | undefined
): boolean {
  if (!secret) return false;
  const bearer = /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1];
  const presented = bearer ?? headers.get('x-vapi-secret');
  if (!presented) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(secret));
}
