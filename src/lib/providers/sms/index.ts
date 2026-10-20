import { isProduction, serverEnv } from '../../config/env';
import { MockSmsProvider } from './mock';
import { TwilioSmsProvider } from './twilio';
import { ISmsProvider } from './types';

export * from './types';
export * from './mock';
export * from './twilio';

export function getSmsProvider(): ISmsProvider {
  if (serverEnv.useMockSms() && !isProduction()) {
    return new MockSmsProvider();
  }
  return new TwilioSmsProvider();
}
