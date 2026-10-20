import { NextResponse, type NextRequest } from 'next/server';
import { canManage, getSessionContext } from '@/lib/auth/session';
import { encryptToken } from '@/lib/crypto/token-cipher';
import { verifyOAuthState } from '@/lib/google/oauth-state';
import { getReviewEngineDeps, OAUTH_STATE_COOKIE, oauthStateSecret } from '@/lib/reviews/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google redirects here after consent. The state must match the cookie set by /start AND name the
// signed-in user's own organization; only then are tokens stored (encrypted) and a location picked.
export async function GET(request: NextRequest) {
  const done = (result: string) => {
    const response = NextResponse.redirect(new URL(`/dashboard/settings?google=${result}`, request.url));
    response.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
    return response;
  };

  const session = await getSessionContext();
  if (!session?.organizationId || !canManage(session.role)) return done('forbidden');
  if (request.nextUrl.searchParams.get('error')) return done('denied');

  const state = verifyOAuthState(request.nextUrl.searchParams.get('state') ?? '', request.cookies.get(OAUTH_STATE_COOKIE)?.value, oauthStateSecret());
  if (!state || state.organizationId !== session.organizationId) return done('expired');

  const code = request.nextUrl.searchParams.get('code');
  if (!code) return done('denied');

  try {
    const deps = getReviewEngineDeps();
    const tokens = await deps.google.exchangeCode(code);
    const locations = await deps.google.listLocations(tokens.accessToken);
    if (locations.length === 0) return done('no_locations');
    const [location] = locations; // first location; the settings page lets owners switch
    await deps.store.saveConnection(session.organizationId, {
      accountId: location.accountId,
      locationId: location.locationId,
      locationName: location.title,
      encryptedAccessToken: encryptToken(tokens.accessToken, deps.encryptionKey),
      encryptedRefreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken, deps.encryptionKey) : null,
      expiresAt: tokens.expiresAt.toISOString(),
    });
    return done('connected');
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Google connect callback failed', error: String(err) }));
    return done('failed');
  }
}
