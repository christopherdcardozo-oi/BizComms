export interface GenerateReplyParams {
  businessName: string;
  reviewerName: string;
  starRating: number;
  reviewComment?: string;
  tone?: string; // free text from google_configs.reply_tone
  customInstructions?: string | null;
  businessContext?: string[]; // facts from the business profile (business-profile.ts reviewContext)
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
