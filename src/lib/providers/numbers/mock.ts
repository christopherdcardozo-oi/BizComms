import type { AvailableNumber, INumberProvisioningProvider, NumberWebhooks, PurchasedNumber } from './types';

export class MockNumberProvisioningProvider implements INumberProvisioningProvider {
  purchased: Array<{ sid: string; phoneNumber: string; webhooks: NumberWebhooks }> = [];
  released: string[] = [];
  fallbackUpdates: Array<{ sid: string; url: string | null }> = [];

  async searchLocal(areaCode: string): Promise<AvailableNumber[]> {
    return Array.from({ length: 5 }, (_, i) => {
      const phoneNumber = `+1${areaCode}555${String(100 + i).padStart(4, '0')}`;
      return { phoneNumber, friendlyName: `(${areaCode}) 555-${String(100 + i).padStart(4, '0')}`, locality: 'Mocktown', region: 'US' };
    });
  }

  async purchase(phoneNumber: string, webhooks: NumberWebhooks): Promise<PurchasedNumber> {
    const sid = `PN_mock_${phoneNumber.replace(/\D/g, '')}`;
    this.purchased.push({ sid, phoneNumber, webhooks });
    return { sid, phoneNumber };
  }

  async updateVoiceFallback(sid: string, url: string | null): Promise<void> {
    this.fallbackUpdates.push({ sid, url });
  }

  async release(sid: string): Promise<void> {
    this.released.push(sid);
  }
}
