import 'server-only';
import { serverEnv, webhookUrl } from '../config/env';
import { getSmsProvider } from '../providers/sms';
import { getTelephonyProvider } from '../providers/telephony';
import { getReplayBuffer } from '../queue/replay-buffer';
import { getSupabaseAdmin } from '../supabase/admin';
import { LineConfigCache } from './line-cache';
import { SupabaseCallRepository } from './supabase-repository';
import type { Logger, TelephonyDeps } from './types';

const logger: Logger = {
  warn: (message, context) => console.warn(JSON.stringify({ level: 'warn', message, ...context })),
  error: (message, context) => console.error(JSON.stringify({ level: 'error', message, ...context })),
};

let shared: { repo: SupabaseCallRepository; lines: LineConfigCache } | null = null;

// The repository and line cache live for the lifetime of the server instance so the
// last-known-good cache survives between requests.
export function getTelephonyDeps(): TelephonyDeps {
  if (!shared) {
    const repo = new SupabaseCallRepository(getSupabaseAdmin());
    shared = { repo, lines: new LineConfigCache(repo) };
  }
  return {
    ...shared,
    telephony: getTelephonyProvider(),
    sms: getSmsProvider(),
    replayBuffer: getReplayBuffer(),
    logger,
    now: () => new Date(),
    killSwitch: serverEnv.killSwitch(),
    requireA2pApproval: !serverEnv.useMockSms(),
    actionUrl: (leg) => webhookUrl(`/api/incoming-call/action?leg=${leg}`),
    smsStatusUrl: webhookUrl('/api/sms/status'),
    smsKeywordReplies: serverEnv.smsKeywordReplies(),
    vapi: { sipEndpoint: serverEnv.vapiSipEndpoint(), defaultAssistantId: serverEnv.vapiDefaultAssistantId() },
  };
}
