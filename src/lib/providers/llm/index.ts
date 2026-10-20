import { MockLlmProvider } from './mock';
import { ILlmProvider } from './types';

export * from './types';
export * from './mock';

export function getLlmProvider(): ILlmProvider {
  return new MockLlmProvider();
}
