export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();

  async limit(identifier: string, limitCount = 60, windowSeconds = 60): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    const timestamps = (this.requests.get(identifier) || []).filter((ts) => ts > windowStart);

    if (timestamps.length >= limitCount) {
      return {
        success: false,
        limit: limitCount,
        remaining: 0,
        reset: Math.ceil((timestamps[0] + windowMs) / 1000),
      };
    }

    timestamps.push(now);
    this.requests.set(identifier, timestamps);

    return {
      success: true,
      limit: limitCount,
      remaining: limitCount - timestamps.length,
      reset: Math.ceil((now + windowMs) / 1000),
    };
  }
}

export const rateLimiterFallback = new InMemoryRateLimiter();
