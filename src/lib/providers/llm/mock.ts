import { sentimentFromStars } from './prompt';
import { GenerateReplyParams, GenerateReplyResult, ILlmProvider } from './types';

export class MockLlmProvider implements ILlmProvider {
  async generateReviewReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const isPositive = params.starRating >= 4;
    const sentiment = sentimentFromStars(params.starRating);
    const firstName = (params.reviewerName || 'there').split(' ')[0];

    let replyText = '';
    if (isPositive) {
      replyText = `Thank you so much, ${firstName}! We truly appreciate your generous feedback and are proud to serve you at ${params.businessName}.`;
    } else {
      replyText = `Hello ${firstName}, thank you for your candid feedback. At ${params.businessName}, we hold our service to high standards and apologize that your experience fell short. Please reach out so we can make this right.`;
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
