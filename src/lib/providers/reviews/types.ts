export interface GoogleReviewItem {
  reviewId: string; // the review's own id (last path segment)
  reviewerName: string;
  reviewerPhotoUrl?: string;
  starRating: number; // 1-5
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

export interface GoogleLocation {
  accountId: string; // "accounts/123"
  locationId: string; // "locations/456"
  title: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null; // Google only returns it on first consent (prompt=consent forces it)
  expiresAt: Date;
}

export interface ReviewLocationRef {
  accountId: string;
  locationId: string;
  accessToken: string;
}

export interface PublishReplyParams extends ReviewLocationRef {
  reviewId: string;
  replyText: string;
}

export interface IReviewsProvider {
  // OAuth (Google Business Profile, scope business.manage)
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleTokens>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;
  listLocations(accessToken: string): Promise<GoogleLocation[]>;
  // Reviews (v4)
  listReviews(location: ReviewLocationRef): Promise<GoogleReviewItem[]>;
  publishReply(params: PublishReplyParams): Promise<void>;
}
