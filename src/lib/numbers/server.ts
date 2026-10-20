import 'server-only';
import { serverEnv, webhookUrl } from '../config/env';
import { getNumberProvisioningProvider } from '../providers/numbers';
import type { NumberWebhooks } from '../providers/numbers/types';
import { getSupabaseAdmin } from '../supabase/admin';
import { buildFailOpenUrl } from './fallback-url';
import { SupabaseLineStore } from './supabase-line-store';

export function failOpenUrlFor(forwardToNumber: string): string | undefined {
  return buildFailOpenUrl(forwardToNumber, {
    workerUrl: serverEnv.failOpenWorkerUrl(),
    signingSecret: serverEnv.failOpenSigningSecret(),
  });
}

export function numberWebhooks(forwardToNumber: string): NumberWebhooks {
  return {
    voiceUrl: webhookUrl('/api/incoming-call'),
    voiceFallbackUrl: failOpenUrlFor(forwardToNumber),
    statusCallback: webhookUrl('/api/incoming-call/status'),
    smsUrl: webhookUrl('/api/sms/webhook'),
  };
}

export function getProvisioningDeps() {
  return {
    provider: getNumberProvisioningProvider(),
    store: new SupabaseLineStore(getSupabaseAdmin()),
    webhooks: numberWebhooks,
    logger: {
      error: (message: string, context?: Record<string, unknown>) =>
        console.error(JSON.stringify({ level: 'error', message, ...context })),
    },
  };
}
