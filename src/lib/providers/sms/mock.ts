import { ISmsProvider, SendSmsParams, SendSmsResult } from './types';

export class MockSmsProvider implements ISmsProvider {
  public sentMessages: SendSmsParams[] = [];

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    this.sentMessages.push(params);
    const mockSid = `SM_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return {
      messageSid: mockSid,
      status: 'queued',
    };
  }

  verifyIncomingWebhookSignature(_url: string, _params: Record<string, string>, _signature: string): boolean {
    return true;
  }
}
