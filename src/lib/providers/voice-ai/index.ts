import { MockVoiceAiProvider } from './mock';
import { IVoiceAiProvider } from './types';

export * from './types';
export * from './mock';

export function getVoiceAiProvider(): IVoiceAiProvider {
  return new MockVoiceAiProvider();
}
