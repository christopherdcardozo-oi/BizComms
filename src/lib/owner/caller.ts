import twilio from 'twilio';
import { isProduction, serverEnv } from '../config/env';
import type { OwnerCaller } from './types';

// Twilio calls the owner first; when they pick up, they hear the announcement and are connected
// to the customer, who sees the business number (callerId), never the owner's cell.
export class TwilioOwnerCaller implements OwnerCaller {
  private client = twilio(serverEnv.twilioAccountSid(), serverEnv.twilioAuthToken());

  async bridge(input: { ownerNumber: string; customerNumber: string; businessNumber: string; announce: string }) {
    const response = new twilio.twiml.VoiceResponse();
    response.say(input.announce);
    response.dial({ callerId: input.businessNumber, timeout: 30 }).number(input.customerNumber);
    await this.client.calls.create({ to: input.ownerNumber, from: input.businessNumber, twiml: response.toString() });
  }
}

// Records bridge requests instead of placing calls (local dev and tests).
export class MockOwnerCaller implements OwnerCaller {
  public calls: Array<{ ownerNumber: string; customerNumber: string; businessNumber: string; announce: string }> = [];
  async bridge(input: { ownerNumber: string; customerNumber: string; businessNumber: string; announce: string }) {
    this.calls.push(input);
  }
}

export function getOwnerCaller(): OwnerCaller {
  // Mock texting or telephony means a dev/test environment: never place real calls there.
  if ((serverEnv.useMockSms() || serverEnv.useMockTelephony()) && !isProduction()) return new MockOwnerCaller();
  return new TwilioOwnerCaller();
}
