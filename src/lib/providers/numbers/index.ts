import { isProduction, serverEnv } from '../../config/env';
import { MockNumberProvisioningProvider } from './mock';
import { TwilioNumberProvisioningProvider } from './twilio';
import type { INumberProvisioningProvider } from './types';

export * from './types';
export * from './mock';
export * from './twilio';

export function getNumberProvisioningProvider(): INumberProvisioningProvider {
  if (serverEnv.useMockTelephony() && !isProduction()) {
    return new MockNumberProvisioningProvider();
  }
  return new TwilioNumberProvisioningProvider();
}
