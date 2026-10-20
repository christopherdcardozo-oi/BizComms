import { isProduction } from '../../config/env';
import { GoogleReviewsProvider } from './google';
import { MockReviewsProvider } from './mock';
import type { IReviewsProvider } from './types';

export * from './types';
export * from './mock';
export * from './google';

export function getReviewsProvider(): IReviewsProvider {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback';
  if (process.env.USE_MOCK_GOOGLE_REVIEWS === 'true' && !isProduction()) return new MockReviewsProvider(redirectUri);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.');
  return new GoogleReviewsProvider({ clientId, clientSecret, redirectUri });
}
