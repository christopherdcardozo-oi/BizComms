import twilio from 'twilio';
import { serverEnv } from '../../config/env';
import type { AvailableNumber, INumberProvisioningProvider, NumberWebhooks, PurchasedNumber } from './types';

export class TwilioNumberProvisioningProvider implements INumberProvisioningProvider {
  private client = twilio(serverEnv.twilioAccountSid(), serverEnv.twilioAuthToken());

  async searchLocal(areaCode: string): Promise<AvailableNumber[]> {
    const numbers = await this.client.availablePhoneNumbers('US').local.list({
      areaCode: Number(areaCode),
      smsEnabled: true,
      voiceEnabled: true,
      limit: 10,
    });
    return numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality || undefined,
      region: n.region || undefined,
    }));
  }

  async purchase(phoneNumber: string, webhooks: NumberWebhooks): Promise<PurchasedNumber> {
    const number = await this.client.incomingPhoneNumbers.create({
      phoneNumber,
      voiceUrl: webhooks.voiceUrl,
      voiceMethod: 'POST',
      ...(webhooks.voiceFallbackUrl ? { voiceFallbackUrl: webhooks.voiceFallbackUrl, voiceFallbackMethod: 'GET' as const } : {}),
      statusCallback: webhooks.statusCallback,
      statusCallbackMethod: 'POST',
      smsUrl: webhooks.smsUrl,
      smsMethod: 'POST',
    });
    return { sid: number.sid, phoneNumber: number.phoneNumber };
  }

  async updateVoiceFallback(sid: string, voiceFallbackUrl: string | null): Promise<void> {
    await this.client.incomingPhoneNumbers(sid).update({ voiceFallbackUrl: voiceFallbackUrl ?? '' });
  }

  async release(sid: string): Promise<void> {
    await this.client.incomingPhoneNumbers(sid).remove();
  }
}
