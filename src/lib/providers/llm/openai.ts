import OpenAI from 'openai';
import { parseReplyJson, reviewReplyPrompt } from './prompt';
import type { GenerateReplyParams, GenerateReplyResult, ILlmProvider } from './types';

export class OpenAiLlmProvider implements ILlmProvider {
  private client: OpenAI;

  constructor(apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateReviewReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const { system, user } = reviewReplyPrompt(params);
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.6,
      max_tokens: 400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'review_reply',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['reply', 'sentiment'],
            properties: { reply: { type: 'string' }, sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] } },
          },
        },
      },
    });
    const { reply, sentiment } = parseReplyJson(completion.choices[0]?.message?.content ?? '', params.starRating);
    return {
      replyText: reply,
      sentiment,
      modelUsed: completion.model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    };
  }
}
