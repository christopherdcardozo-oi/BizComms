import { NextResponse, type NextRequest } from 'next/server';
import { canManage, getSessionContext } from '@/lib/auth/session';
import { billingAllowsService } from '@/lib/billing/status';
import { createOAuthState } from '@/lib/google/oauth-state';
import { getReviewsProvider } from '@/lib/providers/reviews';
import { OAUTH_STATE_COOKIE, oauthStateSecret } from '@/lib/reviews/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Starts "Connect Google Business Profile" for the signed-in owner/admin's organization.
export async function GET(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.redirect(new URL('/login?next=/dashboard/settings', request.url));
  if (!session.organizationId || !canManage(session.role)) return NextResponse.redirect(new URL('/dashboard/settings?google=forbidden', request.url));
  if (!billingAllowsService(session.subscriptionStatus)) return NextResponse.redirect(new URL('/dashboard/settings?google=billing', request.url));

  try {
    const state = createOAuthState(session.organizationId, oauthStateSecret());
    const response = NextResponse.redirect(getReviewsProvider().buildAuthUrl(state));
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 600,
    });
    return response;
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Google connect start failed', error: String(err) }));
    return NextResponse.redirect(new URL('/dashboard/settings?google=unavailable', request.url));
  }
}
