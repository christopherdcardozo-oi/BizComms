import { MockReviewsProvider } from './mock';
import { IReviewsProvider } from './types';

export * from './types';
export * from './mock';

export function getReviewsProvider(): IReviewsProvider {
  return new MockReviewsProvider();
}
