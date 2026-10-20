export interface CreateAssistantParams {
  name: string;
  systemPrompt: string;
  firstMessage?: string;
  voiceId?: string;
  provider?: 'vapi' | 'retell';
}

export interface AssistantResult {
  assistantId: string;
  sipUri: string;
}

export interface WebhookCallEvent {
  messageType: 'status-update' | 'end-of-call-report' | 'transcript';
  callId: string;
  durationSeconds?: number;
  transcript?: string;
  summary?: string;
  customerPhone?: string;
}

export interface IVoiceAiProvider {
  createOrUpdateAssistant(params: CreateAssistantParams): Promise<AssistantResult>;
  verifyWebhookEvent(headers: Record<string, string>, body: string): boolean;
  parseCallReport(payload: unknown): WebhookCallEvent;
}
