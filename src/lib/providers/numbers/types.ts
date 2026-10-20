export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
}

export interface NumberWebhooks {
  voiceUrl: string;
  // Independent fail-open target (DESIGN_NOTES §6); omitted until the edge worker is deployed.
  voiceFallbackUrl?: string;
  statusCallback: string;
  smsUrl: string;
}

export interface PurchasedNumber {
  sid: string;
  phoneNumber: string;
}

export interface INumberProvisioningProvider {
  searchLocal(areaCode: string): Promise<AvailableNumber[]>;
  purchase(phoneNumber: string, webhooks: NumberWebhooks): Promise<PurchasedNumber>;
  updateVoiceFallback(sid: string, voiceFallbackUrl: string | null): Promise<void>;
  release(sid: string): Promise<void>;
}
