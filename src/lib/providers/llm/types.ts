export interface GenerateReplyParams {
  businessName: string;
  reviewerName: string;
  starRating: number;
  reviewComment?: string;
  tone?: 'professional' | 'warm' | 'concise';
}

export interface GenerateReplyResult {
  replyText: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
}

export interface ILlmProvider {
  generateReviewReply(params: GenerateReplyParams): Promise<GenerateReplyResult>;
}
