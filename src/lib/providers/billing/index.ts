import { isProduction, serverEnv } from '../../config/env';
import { MockBillingProvider } from './mock';
import { StripeBillingProvider } from './stripe';
import type { IBillingProvider } from './types';

export * from './types';
export * from './mock';
export * from './stripe';

let mock: MockBillingProvider | null = null;

export function getBillingProvider(): IBillingProvider {
  // The mock grants an active subscription to anyone, so it is never allowed in production.
  if (serverEnv.useMockBilling() && !isProduction()) {
    mock ??= new MockBillingProvider();
    return mock;
  }
  const key = serverEnv.stripeSecretKey();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  return new StripeBillingProvider(key);
}
