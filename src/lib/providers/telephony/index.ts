import { isProduction, serverEnv } from '../../config/env';
import { MockTelephonyProvider } from './mock';
import { TwilioTelephonyProvider } from './twilio';
import { ITelephonyProvider } from './types';

export * from './types';
export * from './mock';
export * from './twilio';

export function getTelephonyProvider(): ITelephonyProvider {
  // The mock skips signature verification, so it is never allowed in production.
  if (serverEnv.useMockTelephony() && !isProduction()) {
    return new MockTelephonyProvider();
  }
  return new TwilioTelephonyProvider();
}
