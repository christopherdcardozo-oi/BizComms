import type { INumberProvisioningProvider } from '../providers/numbers/types';

// Statuses where the customer is no longer paying. 'past_due' is excluded: Stripe is still
// retrying the card and the subscription usually recovers.
export const RELEASABLE_STATUSES = ['canceled', 'unpaid', 'incomplete_expired', 'paused'] as const;

export const DEFAULT_GRACE_DAYS = 30;
// A misconfigured "0" must never release the number of someone who canceled a minute ago.
export const MIN_GRACE_DAYS = 7;

export function resolveGraceDays(raw: string | undefined): number {
  const days = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(days)) return DEFAULT_GRACE_DAYS;
  return Math.max(days, MIN_GRACE_DAYS);
}

export function releaseDate(statusChangedAt: string | Date, graceDays: number): Date {
  return new Date(new Date(statusChangedAt).getTime() + graceDays * 86_400_000);
}

export interface LapsedLine {
  configId: string;
  organizationId: string;
  twilioPhoneNumber: string;
  twilioPhoneSid: string | null;
}

export interface ReleaseStore {
  findLapsedLines(statuses: readonly string[], changedBefore: string, limit: number): Promise<LapsedLine[]>;
  // Re-checked right before releasing, in case the customer resubscribed mid-run.
  isStillLapsed(organizationId: string, statuses: readonly string[], changedBefore: string): Promise<boolean>;
  deleteLine(configId: string, organizationId: string): Promise<void>;
}

export interface ReleaseReport {
  released: string[]; // phone numbers
  failed: Array<{ phoneNumber: string; reason: string }>;
  skipped: Array<{ phoneNumber: string; reason: 'resubscribed' | 'missing_sid' }>;
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 404;
}

// Releases Twilio numbers of organizations that stopped paying more than `graceDays` ago.
// Order matters: release at Twilio first, then delete the row. If the release fails the row
// stays (nothing is silently lost); if the delete fails after a release, the next run gets a
// 404 from Twilio, treats the number as already gone, and finishes the cleanup.
export async function releaseLapsedNumbers(deps: {
  provider: Pick<INumberProvisioningProvider, 'release'>;
  store: ReleaseStore;
  now: () => Date;
  graceDays: number;
  limit?: number;
  logger: { warn(m: string, c?: Record<string, unknown>): void; error(m: string, c?: Record<string, unknown>): void };
}): Promise<ReleaseReport> {
  const cutoff = new Date(deps.now().getTime() - deps.graceDays * 86_400_000).toISOString();
  const report: ReleaseReport = { released: [], failed: [], skipped: [] };
  const lines = await deps.store.findLapsedLines(RELEASABLE_STATUSES, cutoff, deps.limit ?? 50);

  for (const line of lines) {
    if (!(await deps.store.isStillLapsed(line.organizationId, RELEASABLE_STATUSES, cutoff))) {
      report.skipped.push({ phoneNumber: line.twilioPhoneNumber, reason: 'resubscribed' });
      continue;
    }
    if (!line.twilioPhoneSid) {
      // Can't release what we can't identify at Twilio; leave it for a human.
      deps.logger.warn('Lapsed line has no Twilio SID; release it manually', { configId: line.configId });
      report.skipped.push({ phoneNumber: line.twilioPhoneNumber, reason: 'missing_sid' });
      continue;
    }

    try {
      await deps.provider.release(line.twilioPhoneSid);
    } catch (err) {
      if (!isNotFound(err)) {
        deps.logger.error('Twilio number release failed; keeping the line', { sid: line.twilioPhoneSid, error: String(err) });
        report.failed.push({ phoneNumber: line.twilioPhoneNumber, reason: 'release_failed' });
        continue;
      }
    }

    try {
      await deps.store.deleteLine(line.configId, line.organizationId);
      report.released.push(line.twilioPhoneNumber);
    } catch (err) {
      deps.logger.error('Number released but line row not deleted; next run will finish', { configId: line.configId, error: String(err) });
      report.failed.push({ phoneNumber: line.twilioPhoneNumber, reason: 'delete_failed' });
    }
  }
  return report;
}
