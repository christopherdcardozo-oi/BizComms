export interface ReceptionistConfig {
  organizationId: string;
  businessName: string;
  systemPrompt: string;
  firstMessage: string;
  sipUri: string; // sip:bizcomms-<orgId>@sip.vapi.ai
  webhookUrl: string;
  // How the end-of-call summary is written (it is texted to the owner; 'URGENT:' prefix marks urgent calls).
  summaryPrompt?: string;
}

export interface ProvisionedReceptionist {
  assistantId: string;
  phoneNumberId: string;
}

export interface IVoiceAiProvider {
  // Creates the org's assistant + SIP phone number, or updates them in place when ids exist.
  upsertReceptionist(
    config: ReceptionistConfig,
    existing?: { assistantId: string | null; phoneNumberId: string | null }
  ): Promise<ProvisionedReceptionist>;
}
