export interface GoogleReviewItem {
  reviewId: string;
  reviewerName: string;
  reviewerPhotoUrl?: string;
  starRating: number;
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

export interface PublishReplyParams {
  locationId: string;
  reviewId: string;
  replyText: string;
  accessToken: string;
}

export interface IReviewsProvider {
  listReviews(locationId: string, accessToken: string): Promise<GoogleReviewItem[]>;
  publishReply(params: PublishReplyParams): Promise<boolean>;
}
