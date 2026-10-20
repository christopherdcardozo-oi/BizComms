import { OAuth2Client } from 'google-auth-library';
import type {
  GoogleLocation,
  GoogleReviewItem,
  GoogleTokens,
  IReviewsProvider,
  PublishReplyParams,
  ReviewLocationRef,
} from './types';

const SCOPE = 'https://www.googleapis.com/auth/business.manage';
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const MAX_PAGES = 10; // 500 most recent reviews per sync is plenty for a local business

// Google Business Profile: OAuth via google-auth-library; reviews via v4
// (GET .../reviews, PUT .../reviews/{id}/reply — DESIGN_NOTES §4); accounts/locations via the v1 APIs.
export class GoogleReviewsProvider implements IReviewsProvider {
  private oauth: OAuth2Client;

  constructor(config: { clientId: string; clientSecret: string; redirectUri: string }) {
    this.oauth = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  }

  buildAuthUrl(state: string): string {
    return this.oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [SCOPE], state, include_granted_scopes: true });
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    const { tokens } = await this.oauth.getToken(code);
    if (!tokens.access_token) throw new Error('Google returned no access token');
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3_300_000),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const client = new OAuth2Client(this.oauth._clientId, this.oauth._clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) throw new Error('Google refresh returned no access token');
    return { accessToken: credentials.access_token, expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3_300_000) };
  }

  private async get<T>(url: string, accessToken: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Google GET ${new URL(url).pathname} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async listLocations(accessToken: string): Promise<GoogleLocation[]> {
    const { accounts = [] } = await this.get<{ accounts?: Array<{ name: string }> }>(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      accessToken
    );
    const out: GoogleLocation[] = [];
    for (const account of accounts) {
      const { locations = [] } = await this.get<{ locations?: Array<{ name: string; title?: string }> }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title&pageSize=100`,
        accessToken
      );
      for (const loc of locations) out.push({ accountId: account.name, locationId: loc.name, title: loc.title ?? loc.name });
    }
    return out;
  }

  async listReviews(location: ReviewLocationRef): Promise<GoogleReviewItem[]> {
    const items: GoogleReviewItem[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`https://mybusiness.googleapis.com/v4/${location.accountId}/${location.locationId}/reviews`);
      url.searchParams.set('pageSize', '50');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await this.get<{
        reviews?: Array<{
          reviewId: string;
          reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
          starRating?: string;
          comment?: string;
          createTime: string;
          updateTime: string;
          reviewReply?: { comment: string; updateTime: string };
        }>;
        nextPageToken?: string;
      }>(url.toString(), location.accessToken);
      for (const r of data.reviews ?? []) {
        const stars = STARS[r.starRating ?? ''];
        if (!stars) continue; // STAR_RATING_UNSPECIFIED
        items.push({
          reviewId: r.reviewId,
          reviewerName: r.reviewer?.isAnonymous ? 'Anonymous' : r.reviewer?.displayName || 'Anonymous',
          reviewerPhotoUrl: r.reviewer?.profilePhotoUrl,
          starRating: stars,
          comment: r.comment,
          createTime: r.createTime,
          updateTime: r.updateTime,
          reviewReply: r.reviewReply,
        });
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return items;
  }

  async publishReply(params: PublishReplyParams): Promise<void> {
    const url = `https://mybusiness.googleapis.com/v4/${params.accountId}/${params.locationId}/reviews/${encodeURIComponent(params.reviewId)}/reply`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: params.replyText }),
    });
    if (!res.ok) throw new Error(`Google reply publish failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}
