import { AssistantResult, CreateAssistantParams, IVoiceAiProvider, WebhookCallEvent } from './types';

export class MockVoiceAiProvider implements IVoiceAiProvider {
  async createOrUpdateAssistant(params: CreateAssistantParams): Promise<AssistantResult> {
    return {
      assistantId: `vapi_ast_mock_${params.name.toLowerCase().replace(/\s+/g, '_')}`,
      sipUri: 'sip:sip.vapi.ai:5060;assistantId=mock-assistant',
    };
  }

  verifyWebhookEvent(_headers: Record<string, string>, _body: string): boolean {
    return true;
  }

  parseCallReport(payload: unknown): WebhookCallEvent {
    const data = payload as Record<string, unknown>;
    return {
      messageType: 'end-of-call-report',
      callId: (data.callId as string) || 'mock-call-id',
      durationSeconds: Number(data.durationSeconds) || 45,
      transcript: (data.transcript as string) || 'Mock conversation transcript.',
      summary: (data.summary as string) || 'Caller inquired about service appointments.',
      customerPhone: (data.customerPhone as string) || '+12025550101',
    };
  }
}
