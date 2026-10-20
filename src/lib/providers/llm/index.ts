import { isProduction } from '../../config/env';
import { GeminiLlmProvider } from './gemini';
import { MockLlmProvider } from './mock';
import { OpenAiLlmProvider } from './openai';
import type { ILlmProvider } from './types';

export * from './types';
export * from './mock';
export * from './prompt';

// LLM_PROVIDER: "mock" (default outside production) | "openai" | "gemini".
export function getLlmProvider(): ILlmProvider {
  const provider = process.env.LLM_PROVIDER ?? 'mock';
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not configured.');
    return new OpenAiLlmProvider(key, process.env.OPENAI_MODEL || 'gpt-4o-mini');
  }
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not configured.');
    if (process.env.GEMINI_PAID_TIER_CONFIRMED !== 'true') {
      throw new Error('Refusing Gemini: set GEMINI_PAID_TIER_CONFIRMED=true only for a billing-enabled (paid) project; the free tier may train on customer reviews.');
    }
    return new GeminiLlmProvider(key, process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  }
  if (isProduction()) throw new Error('LLM_PROVIDER must be "openai" or "gemini" in production.');
  return new MockLlmProvider();
}
