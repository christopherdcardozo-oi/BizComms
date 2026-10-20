import type { GoogleLocation, GoogleReviewItem, GoogleTokens, IReviewsProvider, PublishReplyParams, ReviewLocationRef } from './types';

// Local-dev Google: consent "succeeds" instantly (the auth URL points straight at our callback)
// and one location returns a fixed mix of positive and negative reviews.
export class MockReviewsProvider implements IReviewsProvider {
  publishedReplies: PublishReplyParams[] = [];
  reviews: GoogleReviewItem[] = [
    {
      reviewId: 'mock-rev-001',
      reviewerName: 'Sarah Jenkins',
      starRating: 5,
      comment: 'Fast response and very helpful technician!',
      createTime: new Date(Date.now() - 3_600_000).toISOString(),
      updateTime: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      reviewId: 'mock-rev-002',
      reviewerName: 'Marcus Vance',
      starRating: 2,
      comment: 'Waited on hold too long and scheduling was confusing.',
      createTime: new Date(Date.now() - 7_200_000).toISOString(),
      updateTime: new Date(Date.now() - 7_200_000).toISOString(),
    },
  ];

  constructor(private callbackUrl = 'http://localhost:3000/api/auth/google/callback') {}

  buildAuthUrl(state: string): string {
    return `${this.callbackUrl}?code=mock-code&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    if (code !== 'mock-code') throw new Error('invalid mock code');
    return { accessToken: 'mock-access', refreshToken: 'mock-refresh', expiresAt: new Date(Date.now() + 3_600_000) };
  }

  async refreshAccessToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    return { accessToken: 'mock-access', expiresAt: new Date(Date.now() + 3_600_000) };
  }

  async listLocations(): Promise<GoogleLocation[]> {
    return [{ accountId: 'accounts/mock-1', locationId: 'locations/mock-1', title: 'Mock Business (Google)' }];
  }

  async listReviews(_location: ReviewLocationRef): Promise<GoogleReviewItem[]> {
    return this.reviews.map((r) => ({ ...r }));
  }

  async publishReply(params: PublishReplyParams): Promise<void> {
    this.publishedReplies.push(params);
    const review = this.reviews.find((r) => r.reviewId === params.reviewId);
    if (review) review.reviewReply = { comment: params.replyText, updateTime: new Date().toISOString() };
  }
}
