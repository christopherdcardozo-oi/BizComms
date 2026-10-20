import { MockBillingProvider } from './mock';
import { IBillingProvider } from './types';

export * from './types';
export * from './mock';

export function getBillingProvider(): IBillingProvider {
  return new MockBillingProvider();
}
