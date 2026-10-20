import { TwilioTelephonyProvider } from './twilio';

// Shares the real TwiML builders; only signature verification is mocked.
export class MockTelephonyProvider extends TwilioTelephonyProvider {
  verifyWebhookSignature(_url: string, _params: Record<string, string>, _signature: string): boolean {
    return true; // Mock provider always authenticates
  }
}
