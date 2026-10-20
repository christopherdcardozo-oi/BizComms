import { GoogleReviewItem, IReviewsProvider, PublishReplyParams } from './types';

export class MockReviewsProvider implements IReviewsProvider {
  public publishedReplies: PublishReplyParams[] = [];

  async listReviews(_locationId: string, _accessToken: string): Promise<GoogleReviewItem[]> {
    return [
      {
        reviewId: 'reviews/mock-rev-001',
        reviewerName: 'Sarah Jenkins',
        starRating: 5,
        comment: 'Fast response and very helpful technician!',
        createTime: new Date(Date.now() - 3600000).toISOString(),
        updateTime: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        reviewId: 'reviews/mock-rev-002',
        reviewerName: 'Marcus Vance',
        starRating: 2,
        comment: 'Waited on hold too long and scheduling was confusing.',
        createTime: new Date(Date.now() - 7200000).toISOString(),
        updateTime: new Date(Date.now() - 7200000).toISOString(),
      },
    ];
  }

  async publishReply(params: PublishReplyParams): Promise<boolean> {
    this.publishedReplies.push(params);
    return true;
  }
}
