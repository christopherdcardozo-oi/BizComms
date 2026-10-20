// Centralized, lazily-read server configuration. Read at call time (not module load) so tests
// and route handlers always see the current process.env.

function flag(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw.trim().toLowerCase() === 'true';
}

export const isProduction = () => process.env.NODE_ENV === 'production';

export const serverEnv = {
  killSwitch: () => flag('EMERGENCY_KILL_SWITCH'),
  useMockTelephony: () => flag('USE_MOCK_TELEPHONY'),
  useMockSms: () => flag('USE_MOCK_SMS'),
  useMockBilling: () => flag('USE_MOCK_BILLING'),
  stripeSecretKey: () => process.env.STRIPE_SECRET_KEY || undefined,
  stripeWebhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET || undefined,
  stripePriceId: () => process.env.STRIPE_PRICE_STARTER || undefined,
  // One Stripe price per plan. Leave all three unset to sell the single STRIPE_PRICE_STARTER price.
  stripePlanPrices: () => ({
    'text-back': process.env.STRIPE_PRICE_TEXT_BACK || undefined,
    receptionist: process.env.STRIPE_PRICE_RECEPTIONIST || undefined,
    complete: process.env.STRIPE_PRICE_COMPLETE || undefined,
  }),
  // Optional one-time setup fee charged with the first invoice (a one-time Stripe price).
  stripeSetupFeePriceId: () => process.env.STRIPE_PRICE_SETUP_FEE || undefined,
  stripeTrialDays: () => {
    const days = Number.parseInt(process.env.STRIPE_TRIAL_DAYS ?? '', 10);
    return Number.isFinite(days) && days > 0 ? days : undefined;
  },
  appUrl: () => (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  twilioAccountSid: () => process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: () => process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioMessagingServiceSid: () => process.env.TWILIO_MESSAGING_SERVICE_SID || undefined,
  // Public origin Twilio actually calls; used for signature validation and callback URLs.
  // Never derive this from the incoming request, which is rewritten by proxies/tunnels.
  webhookBaseUrl: () => (process.env.TWILIO_WEBHOOK_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  vapiSipEndpoint: () => process.env.VAPI_SIP_ENDPOINT ?? 'sip.vapi.ai',
  vapiDefaultAssistantId: () => process.env.VAPI_DEFAULT_ASSISTANT_ID || undefined,
  // Platform Vapi SIP number (sip:<user>@sip.vapi.ai) used only when the database is unreachable.
  vapiDefaultSipUri: () => process.env.VAPI_DEFAULT_SIP_URI || undefined,
  vapiApiKey: () => process.env.VAPI_API_KEY || undefined,
  vapiWebhookSecret: () => process.env.VAPI_WEBHOOK_SECRET || undefined,
  useMockVoiceAi: () => flag('USE_MOCK_VOICE_AI'),
  upstashUrl: () => process.env.UPSTASH_REDIS_REST_URL || undefined,
  upstashToken: () => process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
  cronSecret: () => process.env.CRON_SECRET || undefined,
  numberReleaseGraceDaysRaw: () => process.env.NUMBER_RELEASE_GRACE_DAYS,
  // Edge fail-open worker (DESIGN_NOTES §6). Both must be set for numbers to get a VoiceFallbackUrl.
  failOpenWorkerUrl: () => process.env.FAIL_OPEN_WORKER_URL || undefined,
  failOpenSigningSecret: () => process.env.FALLBACK_SIGNING_SECRET || undefined,
  // 'twilio' (default): Twilio's Opt-Out Management answers STOP/START/HELP, so the app only
  // records state. 'app': Twilio's keyword handling is disabled and this app replies itself.
  smsKeywordReplies: (): 'twilio' | 'app' => (process.env.SMS_KEYWORD_REPLIES === 'app' ? 'app' : 'twilio'),
};

export function webhookUrl(pathWithQuery: string): string {
  return `${serverEnv.webhookBaseUrl()}${pathWithQuery}`;
}
