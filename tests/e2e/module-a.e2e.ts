// End-to-end test of Module A (+ the Module C opt-out it depends on) against a REAL Supabase
// project: real Next.js server, real HTTP, Twilio-signed webhooks verified by the real Twilio
// provider, the real Supabase repository/RPCs, and assertions on the rows that land.
// Outbound texts use the mock SMS sender (rows are still written), so no real SMS is sent.
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY for a TEST project with all migrations applied
// (node scripts/supabase-migrate.mjs). It creates one throwaway organization and deletes it.
//
// Run:  npx sucrase-node tests/e2e/module-a.e2e.ts --i-understand-this-writes-to-supabase
import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const PORT = 3010;
const BASE = `http://localhost:${PORT}`;
const AUTH_TOKEN = 'e2e-twilio-auth-token';

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------
function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync('.env.local')) return env;
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const nanp = (area: string) => `+1${area}555${String(randomInt(1000, 9999))}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && detail !== undefined ? `\n      got: ${JSON.stringify(detail)}` : ''}`);
}

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 8000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

async function startServer(env: Record<string, string>): Promise<ChildProcess> {
  const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout?.on('data', (d) => (log += d));
  server.stderr?.on('data', (d) => (log += d));
  const ready = await waitFor(async () => {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: 'manual' });
      return res.status > 0;
    } catch {
      return false;
    }
  }, 60_000);
  if (!ready) {
    server.kill();
    throw new Error(`Next.js did not start on :${PORT}\n${log.slice(-2000)}`);
  }
  return server;
}

// Signs exactly like Twilio: HMAC-SHA1 over the full public URL + sorted POST params.
async function twilioPost(path: string, params: Record<string, string>, opts: { forge?: boolean } = {}) {
  const url = `${BASE}${path}`;
  const signature = opts.forge ? 'forged' : twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, params);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    body: new URLSearchParams(params).toString(),
  });
  return { status: res.status, body: await res.text() };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
async function main() {
  if (!process.argv.includes('--i-understand-this-writes-to-supabase')) {
    console.error('Refusing to run: pass --i-understand-this-writes-to-supabase (use a TEST Supabase project).');
    process.exit(2);
  }
  const fileEnv = loadEnvLocal();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || serviceKey.includes('local-service-role-key')) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (a TEST project).');
    process.exit(2);
  }
  const db: SupabaseClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const businessNumber = nanp('202');
  const ownerCell = nanp('312');
  const caller = (n: number) => nanp(['773', '847', '630', '708', '224', '331', '872'][n % 7]);
  const callSids: string[] = [];
  const sid = (label: string) => {
    const s = `CAe2e${label}${randomInt(100000, 999999)}`;
    callSids.push(s);
    return s;
  };

  // --- seed: one active, 24/7-open business with an approved A2P campaign ---
  const allDay = { open: '00:00', close: '00:00', closed: false };
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .insert({
      name: 'E2E Test Plumbing',
      slug: `e2e-test-${randomInt(100000, 999999)}`,
      timezone: 'America/Chicago',
      business_hours: Object.fromEntries(days.map((d) => [d, allDay])),
      subscription_status: 'active',
      stripe_subscription_id: 'sub_e2e',
    })
    .select('id')
    .single();
  if (orgErr || !org) throw new Error(`Seeding organization failed: ${orgErr?.message}`);
  const orgId = (org as { id: string }).id;
  console.log(`Seeded test organization ${orgId} with business number ${businessNumber}\n`);

  let server: ChildProcess | null = null;
  try {
    const seeded = await Promise.all([
      db.from('twilio_configs').insert({
        organization_id: orgId,
        is_primary: true,
        twilio_phone_number: businessNumber,
        twilio_phone_sid: 'PNe2e',
        forward_to_number: ownerCell,
        forward_timeout_seconds: 15,
        ai_voice_enabled: false,
        after_hours_direct_to_ai: false,
      }),
      db.from('a2p_registrations').insert({ organization_id: orgId, status: 'approved', messaging_service_sid: 'MGe2e' }),
    ]);
    for (const r of seeded) if (r.error) throw new Error(`Seeding failed: ${r.error.message}`);

    server = await startServer({
      USE_MOCK_TELEPHONY: 'false', // real Twilio signature verification
      USE_MOCK_SMS: 'true', // record texts, never send them
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      TWILIO_WEBHOOK_BASE_URL: BASE,
      EMERGENCY_KILL_SWITCH: 'false',
      SMS_KEYWORD_REPLIES: 'twilio',
      NEXT_TELEMETRY_DISABLED: '1',
    });

    const callLog = async (callSid: string) =>
      (await db.from('call_logs').select('*').eq('call_sid', callSid).maybeSingle()).data as Record<string, unknown> | null;
    const messagesTo = async (to: string) =>
      ((await db.from('messages').select('*').eq('organization_id', orgId).eq('to_number', to)).data ?? []) as Record<string, unknown>[];

    // 1. Security: forged signature and unknown number
    console.log('1. Webhook security');
    const forged = await twilioPost('/api/incoming-call', { CallSid: sid('forged'), From: caller(0), To: businessNumber }, { forge: true });
    check('forged X-Twilio-Signature is rejected with 403', forged.status === 403, forged.status);
    const unknown = await twilioPost('/api/incoming-call', { CallSid: sid('unknown'), From: caller(0), To: '+19995550123' });
    check('call to an unprovisioned number gets <Reject/>', unknown.status === 200 && unknown.body.includes('<Reject/>'), unknown);

    // 2. Answered call, full lifecycle
    console.log('2. Owner answers');
    const c2 = sid('answered');
    const from2 = caller(1);
    const incoming = await twilioPost('/api/incoming-call', { CallSid: c2, From: from2, To: businessNumber, CallStatus: 'ringing' });
    check('incoming call rings the owner within the 15s window', incoming.body.includes(`<Number>${ownerCell}</Number>`) && incoming.body.includes('timeout="15"'), incoming.body);
    check('Dial action points at the signed public action URL', incoming.body.includes(`action="${BASE}/api/incoming-call/action?leg=forward"`), incoming.body);
    const ringing = await waitFor(() => callLog(c2).then((r) => (r?.status === 'ringing' ? r : null)));
    check('call_logs row created (status ringing) by the background write', !!ringing, ringing);
    const answered = await twilioPost('/api/incoming-call/action?leg=forward', { CallSid: c2, From: from2, To: businessNumber, DialCallStatus: 'completed', DialCallSid: 'CAe2echild' });
    check('answered call hangs up cleanly', answered.body.includes('<Hangup/>'), answered.body);
    const status = await twilioPost('/api/incoming-call/status', { CallSid: c2, From: from2, To: businessNumber, CallStatus: 'completed', CallDuration: '42' });
    check('status callback accepted', status.status === 204, status.status);
    const done2 = await waitFor(() => callLog(c2).then((r) => (r?.outcome === 'answered_by_business' && r?.status === 'completed' ? r : null)));
    check('call log: answered_by_business, completed, 42s, ended_at set', !!done2 && done2.duration_seconds === 42 && !!done2.ended_at && done2.child_call_sid === 'CAe2echild', done2);
    const dup = await twilioPost('/api/incoming-call/status', { CallSid: c2, From: from2, To: businessNumber, CallStatus: 'completed', CallDuration: '42' });
    const event = await db.from('webhook_events').select('processed_at').eq('provider', 'twilio').eq('event_id', `call-status:${c2}:completed`).maybeSingle();
    check('duplicate status callback is deduplicated (webhook_events processed)', dup.status === 204 && !!(event.data as { processed_at: string | null } | null)?.processed_at, event.data);
    check('no text sent to a caller who was answered', (await messagesTo(from2)).length === 0);

    // 3. Missed call -> rescue text (AI off)
    console.log('3. Owner misses the call');
    const c3 = sid('missed');
    const from3 = caller(2);
    await twilioPost('/api/incoming-call', { CallSid: c3, From: from3, To: businessNumber });
    const missed = await twilioPost('/api/incoming-call/action?leg=forward', { CallSid: c3, From: from3, To: businessNumber, DialCallStatus: 'no-answer' });
    check('caller hears a short message, then hang-up', missed.body.includes('<Say>') && missed.body.includes('<Hangup/>'), missed.body);
    const texted = await waitFor(() => callLog(c3).then((r) => (r?.outcome === 'missed_call_texted' ? r : null)));
    check('call log: missed_call_texted, sms_rescued = true', !!texted && texted.sms_rescued === true, texted);
    const sent3 = await messagesTo(from3);
    check(
      'exactly one rescue text recorded, from the business number, with STOP language',
      sent3.length === 1 && sent3[0].from_number === businessNumber && String(sent3[0].body).includes('E2E Test Plumbing') && /Reply STOP/.test(String(sent3[0].body)) && sent3[0].type === 'missed_call_auto_reply',
      sent3
    );

    // 4. Redelivered action callback -> still one text
    console.log('4. Duplicate callback');
    await twilioPost('/api/incoming-call/action?leg=forward', { CallSid: c3, From: from3, To: businessNumber, DialCallStatus: 'no-answer' });
    await sleep(2500);
    check('rescue text is at-most-once per call', (await messagesTo(from3)).length === 1);

    // 5. Caller hangs up while ringing
    console.log('5. Caller hangs up while ringing');
    const c5 = sid('abandoned');
    const from5 = caller(3);
    await twilioPost('/api/incoming-call', { CallSid: c5, From: from5, To: businessNumber });
    await twilioPost('/api/incoming-call/action?leg=forward', { CallSid: c5, From: from5, To: businessNumber, DialCallStatus: 'canceled' });
    const abandoned = await waitFor(() => callLog(c5).then((r) => (r?.sms_rescued ? r : null)));
    check('call log: caller_abandoned and texted', abandoned?.outcome === 'caller_abandoned', abandoned);

    // 6. STOP opt-out blocks the next rescue text
    console.log('6. Opt-out');
    const from6 = caller(4);
    const stop = await twilioPost('/api/sms/webhook', { MessageSid: `SMe2e${randomInt(100000, 999999)}`, From: from6, To: businessNumber, Body: 'STOP' });
    check('STOP acknowledged with empty TwiML (Twilio sends the confirmation)', stop.status === 200 && !stop.body.includes('<Message>'), stop);
    const optOut = await db.from('sms_opt_outs').select('source').eq('organization_id', orgId).eq('phone_number', from6).maybeSingle();
    check('sms_opt_outs row recorded', (optOut.data as { source: string } | null)?.source === 'inbound_stop', optOut.data);
    const c6 = sid('optedout');
    await twilioPost('/api/incoming-call', { CallSid: c6, From: from6, To: businessNumber });
    await twilioPost('/api/incoming-call/action?leg=forward', { CallSid: c6, From: from6, To: businessNumber, DialCallStatus: 'canceled' });
    await sleep(3000);
    const c6log = await callLog(c6);
    check('opted-out caller is NOT texted', (await messagesTo(from6)).length === 0 && c6log?.sms_rescued === false, c6log);

    // 7. Out-of-order: final status arrives before the incoming-call write
    console.log('7. Out-of-order callbacks');
    const c7 = sid('ooo');
    const from7 = caller(5);
    await twilioPost('/api/incoming-call/status', { CallSid: c7, From: from7, To: businessNumber, CallStatus: 'completed', CallDuration: '9' });
    await twilioPost('/api/incoming-call', { CallSid: c7, From: from7, To: businessNumber });
    await sleep(2500);
    const c7log = await callLog(c7);
    check('late "ringing" write never regresses a completed call', c7log?.status === 'completed' && c7log?.duration_seconds === 9, c7log);

    // 8. Usage metering
    console.log('8. Usage');
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const usage = await db.from('usage_records').select('sms_messages_sent').eq('organization_id', orgId).eq('billing_period_start', monthStart).maybeSingle();
    check('SMS usage metered for the 2 rescue texts', (usage.data as { sms_messages_sent: number } | null)?.sms_messages_sent === 2, usage.data);
  } finally {
    server?.kill('SIGTERM');
    // Cascades to twilio_configs, call_logs, messages, sms_opt_outs, a2p_registrations, usage_records.
    await db.from('organizations').delete().eq('id', orgId);
    await db.from('webhook_events').delete().eq('provider', 'twilio').like('event_id', 'call-status:CAe2e%');
    console.log(`\nCleaned up test organization ${orgId}.`);
  }

  console.log(failures === 0 ? '\nE2E PASSED' : `\nE2E FAILED: ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
