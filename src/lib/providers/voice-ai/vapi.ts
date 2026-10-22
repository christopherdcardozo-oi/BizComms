import { RECEPTIONIST_CLOSING } from '../../voice/receptionist';
import type { IVoiceAiProvider, ProvisionedReceptionist, ReceptionistConfig } from './types';

const VAPI_API = 'https://api.vapi.ai';

export interface VapiAuthConfig {
  apiKey: string;
  // Preferred: a Vapi Custom Credential (Bearer) referenced by id. Fallback: the legacy
  // X-Vapi-Secret header (an inline Authorization header would override credentials).
  webhookCredentialId?: string;
  webhookSecret?: string;
}

export class VapiProvider implements IVoiceAiProvider {
  constructor(private auth: VapiAuthConfig) {}

  private async request<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${VAPI_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.auth.apiKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Vapi ${method} ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  private assistantBody(config: ReceptionistConfig) {
    return {
      name: `${config.businessName} receptionist`.slice(0, 40),
      firstMessage: config.firstMessage,
      firstMessageMode: 'assistant-speaks-first',
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: config.systemPrompt }],
      },
      // Cost tuning (docs/cost-research-2026-10.md). Nova-3 with numerals writes spoken digits as
      // numbers, which matters for callback numbers and addresses. Aura-2 costs roughly half of
      // the default voice at similar latency.
      transcriber: { provider: 'deepgram', model: 'nova-3', language: 'en', numerals: true, smartFormat: true },
      voice: { provider: 'deepgram', model: 'aura-2', voiceId: 'thalia' },
      // Message-taking calls run 1–3 minutes. These stop dead air and runaway calls from billing.
      maxDurationSeconds: 300,
      silenceTimeoutSeconds: 20,
      messagePlan: { idleMessages: ['Are you still there?'], idleMessageMaxSpokenCount: 2, idleTimeoutSeconds: 8 },
      endCallFunctionEnabled: true,
      endCallPhrases: [RECEPTIONIST_CLOSING],
      // Job sites and trucks are noisy: filter background speech, and don't add fake office noise.
      backgroundSound: 'off',
      backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
      stopSpeakingPlan: { numWords: 2 },
      serverMessages: ['end-of-call-report', 'status-update'],
      server: {
        url: config.webhookUrl,
        ...(this.auth.webhookCredentialId
          ? { credentialId: this.auth.webhookCredentialId }
          : this.auth.webhookSecret
            ? { headers: { 'X-Vapi-Secret': this.auth.webhookSecret } }
            : {}),
      },
      metadata: { organization_id: config.organizationId },
    };
  }

  async upsertReceptionist(
    config: ReceptionistConfig,
    existing?: { assistantId: string | null; phoneNumberId: string | null }
  ): Promise<ProvisionedReceptionist> {
    const assistant = existing?.assistantId
      ? await this.request<{ id: string }>('PATCH', `/assistant/${existing.assistantId}`, this.assistantBody(config))
      : await this.request<{ id: string }>('POST', '/assistant', this.assistantBody(config));

    let phone: { id: string };
    try {
      phone = existing?.phoneNumberId
        ? await this.request<{ id: string }>('PATCH', `/phone-number/${existing.phoneNumberId}`, { assistantId: assistant.id })
        : await this.request<{ id: string }>('POST', '/phone-number', {
            provider: 'vapi',
            sipUri: config.sipUri,
            assistantId: assistant.id,
            name: `${config.businessName}`.slice(0, 40),
          });
    } catch (err) {
      // Don't leave a brand-new assistant orphaned in the account when its SIP number fails.
      if (!existing?.assistantId) await this.request('DELETE', `/assistant/${assistant.id}`).catch(() => undefined);
      throw err;
    }

    return { assistantId: assistant.id, phoneNumberId: phone.id };
  }
}
