import 'server-only';
import { createHmac } from 'node:crypto';
import { getLlmProvider } from '../providers/llm';
import { getReviewsProvider } from '../providers/reviews';
import { getSupabaseAdmin } from '../supabase/admin';
import type { ReviewEngineDeps } from './engine';
import { SupabaseReviewStore } from './supabase-review-store';

export function getReviewEngineDeps(): ReviewEngineDeps & { store: SupabaseReviewStore } {
  return {
    store: new SupabaseReviewStore(getSupabaseAdmin()),
    google: getReviewsProvider(),
    llm: getLlmProvider(),
    encryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
    now: () => new Date(),
    logger: {
      warn: (message, context) => console.warn(JSON.stringify({ level: 'warn', message, ...context })),
      error: (message, context) => console.error(JSON.stringify({ level: 'error', message, ...context })),
    },
  };
}

// Separate key for OAuth state signing, derived from the token key (never used to encrypt).
export function oauthStateSecret(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is not configured.');
  return createHmac('sha256', key).update('bizcomms:google-oauth-state:v1').digest('base64url');
}

export const OAUTH_STATE_COOKIE = 'gbp_oauth_state';
