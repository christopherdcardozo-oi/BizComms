import { isProduction, serverEnv } from '../../config/env';
import { MockVoiceAiProvider } from './mock';
import type { IVoiceAiProvider } from './types';
import { VapiProvider } from './vapi';

export * from './types';
export * from './mock';
export * from './vapi';

export function getVoiceAiProvider(): IVoiceAiProvider {
  if (serverEnv.useMockVoiceAi() && !isProduction()) return new MockVoiceAiProvider();
  const apiKey = serverEnv.vapiApiKey();
  if (!apiKey) throw new Error('VAPI_API_KEY is not configured.');
  return new VapiProvider({
    apiKey,
    webhookCredentialId: process.env.VAPI_WEBHOOK_CREDENTIAL_ID || undefined,
    webhookSecret: serverEnv.vapiWebhookSecret(),
  });
}
