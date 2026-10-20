import twilio from 'twilio';
import { serverEnv } from '../../config/env';
import { ISmsProvider, SendSmsParams, SendSmsResult } from './types';

export class TwilioSmsProvider implements ISmsProvider {
  private client = twilio(serverEnv.twilioAccountSid(), serverEnv.twilioAuthToken());

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    try {
      const message = await this.client.messages.create({
        to: params.to,
        body: params.body,
        ...(params.messagingServiceSid ? { messagingServiceSid: params.messagingServiceSid } : { from: params.from }),
        ...(params.statusCallback ? { statusCallback: params.statusCallback } : {}),
      });
      return { messageSid: message.sid, status: message.status === 'failed' ? 'failed' : 'queued' };
    } catch (err) {
      const e = err as { code?: number | string; message?: string };
      return {
        messageSid: '',
        status: 'failed',
        errorCode: e.code !== undefined ? String(e.code) : undefined,
        errorMessage: e.message,
      };
    }
  }

  verifyIncomingWebhookSignature(url: string, params: Record<string, string>, signature: string): boolean {
    const authToken = serverEnv.twilioAuthToken();
    if (!authToken || !signature) return false;
    return twilio.validateRequest(authToken, signature, url, params);
  }
}
