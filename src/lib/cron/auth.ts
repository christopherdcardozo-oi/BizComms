import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time CRON_SECRET bearer check (DESIGN_NOTES §3). Both sides are hashed first so the
// comparison is fixed-length and leaks neither the secret's contents nor its length.
// Fails closed when no secret is configured.
export function isAuthorizedCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(secret));
}
