import type { CallRepository, LineConfig } from './types';

interface Entry {
  config: LineConfig | null;
  fetchedAt: number;
}

export type LineLookup = { config: LineConfig | null; source: 'db' | 'cache' | 'stale' };

// Per-instance last-known-good cache of line configs. Fresh entries skip the DB entirely;
// stale entries are only served when the DB lookup throws, so a database outage degrades
// to yesterday's routing instead of dead air. Throws when the DB fails and nothing is cached,
// which the incoming-call route turns into a 5xx so Twilio switches to VoiceFallbackUrl.
export class LineConfigCache {
  private entries = new Map<string, Entry>();

  constructor(
    private repo: Pick<CallRepository, 'findLineByNumber'>,
    private options: { freshMs?: number; staleMs?: number; now?: () => number } = {}
  ) {}

  async resolve(twilioPhoneNumber: string): Promise<LineLookup> {
    const now = (this.options.now ?? Date.now)();
    const freshMs = this.options.freshMs ?? 60_000;
    const staleMs = this.options.staleMs ?? 24 * 60 * 60_000;
    const cached = this.entries.get(twilioPhoneNumber);

    if (cached && now - cached.fetchedAt < freshMs) {
      return { config: cached.config, source: 'cache' };
    }

    try {
      const config = await this.repo.findLineByNumber(twilioPhoneNumber);
      this.entries.set(twilioPhoneNumber, { config, fetchedAt: now });
      return { config, source: 'db' };
    } catch (err) {
      if (cached && cached.config && now - cached.fetchedAt < staleMs) {
        return { config: cached.config, source: 'stale' };
      }
      throw err;
    }
  }
}
