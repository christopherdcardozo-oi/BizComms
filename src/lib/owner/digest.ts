// The 7am "good morning" text: yesterday's calls, who is still waiting for a reply, and money
// recovered this month. Run hourly by cron; each business gets it once, at 7am in its time zone.
import type { LineConfig, TelephonyDeps } from '../telephony/types';
import { sendOwnerAlert, type OwnerAlertResult } from './alerts';

export const DIGEST_HOUR = 7;

export interface DayStats {
  calls: number;
  textedBack: number;
  aiCalls: number;
  waiting: number; // customers whose latest message is theirs (last 7 days)
}

export interface DigestStore {
  listAlertLines(): Promise<LineConfig[]>;
  dayStats(organizationId: string, sinceIso: string, untilIso: string): Promise<DayStats>;
  recoveredCents(organizationId: string, sinceIso: string): Promise<number>;
}

function localParts(at: Date, timezone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function composeDigest(stats: DayStats, recoveredCents: number): string | null {
  if (stats.calls === 0 && stats.waiting === 0 && recoveredCents === 0) return null; // nothing worth a text
  const parts = [`Good morning. Yesterday: ${plural(stats.calls, 'call')}`];
  if (stats.textedBack) parts[0] += `, ${stats.textedBack} missed and texted back`;
  if (stats.aiCalls) parts[0] += `, ${stats.aiCalls} handled by the AI`;
  parts[0] += '.';
  if (stats.waiting) parts.push(`${plural(stats.waiting, 'customer is', 'customers are')} waiting for a reply.`);
  if (recoveredCents) parts.push(`Recovered this month: $${Math.round(recoveredCents / 100).toLocaleString('en-US')}.`);
  parts.push('Reply ? for options.');
  return parts.join(' ');
}

export type DigestReport = { checked: number; sent: number; skipped: number; failed: number };

export async function sendMorningDigests(now: Date, store: DigestStore, deps: TelephonyDeps): Promise<DigestReport> {
  const report: DigestReport = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  for (const line of await store.listAlertLines()) {
    report.checked++;
    const { date, hour } = localParts(now, line.timezone || 'America/Chicago');
    if (hour !== DIGEST_HOUR) continue;
    try {
      const until = now.toISOString();
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const body = composeDigest(await store.dayStats(line.organizationId, since, until), await store.recoveredCents(line.organizationId, monthStart));
      if (!body) {
        report.skipped++;
        continue;
      }
      const result: OwnerAlertResult = await sendOwnerAlert(
        line,
        { kind: 'digest', dedupeKey: `digest:${date}`, contactNumber: null, callSid: null, urgent: false },
        body,
        deps
      );
      if (result === 'sent') report.sent++;
      else if (result === 'failed') report.failed++;
      else report.skipped++;
    } catch (err) {
      report.failed++;
      deps.logger.error('Morning digest failed', { organizationId: line.organizationId, error: String(err) });
    }
  }
  return report;
}
