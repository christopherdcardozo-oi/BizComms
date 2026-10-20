import { GenerateReplyParams, GenerateReplyResult, ILlmProvider } from './types';

export class MockLlmProvider implements ILlmProvider {
  async generateReviewReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const isPositive = params.starRating >= 4;
    const sentiment = isPositive ? 'positive' : params.starRating === 3 ? 'neutral' : 'negative';

    let replyText = '';
    if (isPositive) {
      replyText = `Thank you so much, ${params.reviewerName}! We truly appreciate your generous feedback and are proud to serve you at ${params.businessName}.`;
    } else {
      replyText = `Hello ${params.reviewerName}, thank you for your candid feedback. At ${params.businessName}, we hold our service to high standards and apologize that your experience fell short. Please reach out so we can make this right.`;
    }

    return {
      replyText,
      sentiment,
      modelUsed: 'mock-gpt-4o-mini',
      promptTokens: 120,
      completionTokens: 45,
    };
  }
}
