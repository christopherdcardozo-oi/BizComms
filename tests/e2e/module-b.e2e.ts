// End-to-end test of Module B (AI receptionist) against a REAL Supabase project: Twilio routes
// an after-hours call to the org's Vapi SIP number, then Vapi end-of-call reports (Bearer-authed,
// shaped per Vapi's docs) are applied to the real call log through the real RPCs.
// No Vapi account is needed: the test plays Vapi's side of the webhook.
//
// Run:  npx sucrase-node tests/e2e/module-b.e2e.ts --i-understand-this-writes-to-supabase
import type { ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { AUTH_TOKEN, BASE, check, connectTestDatabase, failureCount, nanp, sleep, startServer, twilioPost, waitFor } from './harness';

const VAPI_SECRET = 'e2e-vapi-webhook-secret';

async function vapiPost(body: unknown, secret = VAPI_SECRET) {
  const res = await fetch(`${BASE}/api/vapi/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function endOfCallReport(opts: {
  vapiCallId: string;
  caller: string;
  seconds: number;
  phoneNumberId: string;
  endedReason?: string;
  correlation?: { callSid: string; orgId: string };
}) {
  const started = new Date(Date.now() - opts.seconds * 1000 - 1000);
  return {
    message: {
      type: 'end-of-call-report',
      endedReason: opts.endedReason ?? 'customer-ended-call',
      call: {
        id: opts.vapiCallId,
        type: 'inboundPhoneCall',
        phoneNumberId: opts.phoneNumberId,
        customer: { number: opts.caller },
        startedAt: started.toISOString(),
        endedAt: new Date(started.getTime() + opts.seconds * 1000).toISOString(),
        ...(opts.correlation
          ? { assistantOverrides: { variableValues: { bizcomms_call_sid: opts.correlation.callSid, bizcomms_org_id: opts.correlation.orgId } } }
          : {}),
      },
      artifact: { transcript: `AI: Thanks for calling. (${opts.vapiCallId})`, recording: { url: `https://storage.vapi.ai/${opts.vapiCallId}.wav` } },
      analysis: { summary: `Summary for ${opts.vapiCallId}` },
    },
  };
}

async function main() {
  const db = connectTestDatabase();
  const run = randomInt(100000, 999999);
  const businessNumber = nanp('202');
  const vapiPhoneNumberId = `vapi-pn-e2e-${run}`;
  const vapiId = (n: number) => `vapi-e2e-${run}-${n}`;

  // Closed every day -> every call is "after hours" and goes straight to the AI.
  const closed = { open: '09:00', close: '17:00', closed: true };
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const { data: org, error } = await db
    .from('organizations')
    .insert({
      name: 'E2E AI Plumbing',
      slug: `e2e-ai-${run}`,
      timezone: 'America/Chicago',
      business_hours: Object.fromEntries(days.map((d) => [d, closed])),
      subscription_status: 'active',
      stripe_subscription_id: 'sub_e2e_ai',
      vapi_assistant_id: `vapi-ast-e2e-${run}`,
      vapi_phone_number_id: vapiPhoneNumberId,
    })
    .select('id')
    .single();
  if (error || !org) throw new Error(`Seeding organization failed: ${error?.message}`);
  const orgId = (org as { id: string }).id;
  console.log(`Seeded AI-enabled test organization ${orgId} (${businessNumber})\n`);

  let server: ChildProcess | null = null;
  try {
    const seeded = await Promise.all([
      db.from('twilio_configs').insert({
        organization_id: orgId,
        is_primary: true,
        twilio_phone_number: businessNumber,
        twilio_phone_sid: 'PNe2eai',
        forward_to_number: nanp('312'),
        abandon_threshold_seconds: 8,
        ai_voice_enabled: true,
        after_hours_direct_to_ai: true,
      }),
      db.from('a2p_registrations').insert({ organization_id: orgId, status: 'approved', messaging_service_sid: 'MGe2eai' }),
    ]);
    for (const r of seeded) if (r.error) throw new Error(`Seeding failed: ${r.error.message}`);

    server = await startServer({
      USE_MOCK_TELEPHONY: 'false',
      USE_MOCK_SMS: 'true',
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      TWILIO_WEBHOOK_BASE_URL: BASE,
      VAPI_WEBHOOK_SECRET: VAPI_SECRET,
      VAPI_SIP_ENDPOINT: 'sip.vapi.ai',
      EMERGENCY_KILL_SWITCH: 'false',
      NEXT_TELEMETRY_DISABLED: '1',
    });

    const callLog = async (callSid: string) =>
      (await db.from('call_logs').select('*').eq('call_sid', callSid).maybeSingle()).data as Record<string, unknown> | null;
    const textsTo = async (to: string) =>
      ((await db.from('messages').select('id').eq('organization_id', orgId).eq('to_number', to)).data ?? []).length;

    // 1. Routing: after hours -> the org's Vapi SIP number, with correlation headers
    console.log('1. After-hours call goes to the AI receptionist');
    const sid1 = `CAe2eai1${run}`;
    const caller1 = nanp('773');
    const incoming = await twilioPost('/api/incoming-call', { CallSid: sid1, From: caller1, To: businessNumber });
    check(
      'TwiML dials sip:bizcomms-<orgId>@sip.vapi.ai with call-sid and org headers',
      incoming.body.includes(`<Sip>sip:bizcomms-${orgId}@sip.vapi.ai?X-bizcomms_org_id=${orgId}&amp;X-bizcomms_call_sid=${sid1}</Sip>`),
      incoming.body
    );
    check('AI leg reports back to the action URL (leg=ai)', incoming.body.includes(`action="${BASE}/api/incoming-call/action?leg=ai"`), incoming.body);
    const handoff = await waitFor(() => callLog(sid1).then((r) => (r?.outcome === 'forwarded_to_ai' ? r : null)));
    check('call log records forwarded_to_ai', !!handoff, handoff);

    // 2. Webhook auth
    console.log('2. Vapi webhook security');
    const forged = await vapiPost(endOfCallReport({ vapiCallId: vapiId(0), caller: caller1, seconds: 2, phoneNumberId: vapiPhoneNumberId }), 'wrong-secret');
    check('report with the wrong secret is rejected (401)', forged.status === 401, forged);

    // 3. Completed AI conversation, correlated by SIP header variables
    console.log('3. Caller talks to the AI');
    const done = await vapiPost(
      endOfCallReport({ vapiCallId: vapiId(1), caller: caller1, seconds: 95, phoneNumberId: vapiPhoneNumberId, correlation: { callSid: sid1, orgId } })
    );
    check('report matched by header and classified as completed', done.status === 200 && done.body.source === 'header' && done.body.outcome === 'ai_conversation_completed', done);
    const log1 = await callLog(sid1);
    check(
      'call log has outcome, Vapi id, transcript, summary, recording, duration',
      log1?.outcome === 'ai_conversation_completed' &&
        log1?.vapi_call_id === vapiId(1) &&
        String(log1?.transcript).includes(vapiId(1)) &&
        log1?.ai_summary === `Summary for ${vapiId(1)}` &&
        String(log1?.recording_url).endsWith(`${vapiId(1)}.wav`) &&
        Number(log1?.duration_seconds) >= 95,
      log1
    );
    check('no text-back after a real AI conversation', (await textsTo(caller1)) === 0);
    const dup = await vapiPost(
      endOfCallReport({ vapiCallId: vapiId(1), caller: caller1, seconds: 95, phoneNumberId: vapiPhoneNumberId, correlation: { callSid: sid1, orgId } })
    );
    check('redelivered report is a no-op duplicate', dup.body.duplicate === true, dup);

    // 4. Caller hangs up on the AI quickly; no headers -> fallback correlation
    console.log('4. Caller hangs up on the AI within the abandon threshold');
    const sid2 = `CAe2eai2${run}`;
    const caller2 = nanp('847');
    await twilioPost('/api/incoming-call', { CallSid: sid2, From: caller2, To: businessNumber });
    await waitFor(() => callLog(sid2).then((r) => (r?.outcome === 'forwarded_to_ai' ? r : null)));
    const quick = await vapiPost(endOfCallReport({ vapiCallId: vapiId(2), caller: caller2, seconds: 3, phoneNumberId: vapiPhoneNumberId }));
    check('matched via the org Vapi number + caller (no SIP headers)', quick.body.source === 'vapi_number', quick);
    check('Case B rescue text sent', quick.body.outcome === 'caller_abandoned_before_ai' && quick.body.rescue === 'sent', quick);
    const log2 = await callLog(sid2);
    check('call log: caller_abandoned_before_ai, sms_rescued', log2?.outcome === 'caller_abandoned_before_ai' && log2?.sms_rescued === true, log2);
    check('exactly one text to that caller', (await textsTo(caller2)) === 1);

    // 5. AI SIP leg fails at Twilio, then Vapi reports a short call: still one text
    console.log('5. AI leg fails, then Vapi reports');
    const sid3 = `CAe2eai3${run}`;
    const caller3 = nanp('630');
    await twilioPost('/api/incoming-call', { CallSid: sid3, From: caller3, To: businessNumber });
    const failed = await twilioPost('/api/incoming-call/action?leg=ai', { CallSid: sid3, From: caller3, To: businessNumber, DialCallStatus: 'failed' });
    check('failed AI leg: caller hears a message and is texted', failed.body.includes('<Hangup/>'), failed.body);
    await waitFor(() => callLog(sid3).then((r) => (r?.sms_rescued ? r : null)));
    const late = await vapiPost(
      endOfCallReport({ vapiCallId: vapiId(3), caller: caller3, seconds: 2, phoneNumberId: vapiPhoneNumberId, correlation: { callSid: sid3, orgId } })
    );
    check('Vapi report does not double-text (already_rescued)', late.body.rescue === 'already_rescued', late);
    check('exactly one text to that caller', (await textsTo(caller3)) === 1);

    // 6. A different Vapi call cannot overwrite a bound call log
    console.log('6. Call log hijack attempt');
    const hijack = await vapiPost(
      endOfCallReport({ vapiCallId: vapiId(4), caller: caller1, seconds: 1, phoneNumberId: vapiPhoneNumberId, correlation: { callSid: sid1, orgId } })
    );
    const after = await callLog(sid1);
    check('second Vapi call is refused; original transcript intact', hijack.body.matched === false && after?.vapi_call_id === vapiId(1) && after?.outcome === 'ai_conversation_completed', { hijack, after });

    // 7. Voice usage metering
    console.log('7. Usage');
    await sleep(500);
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const usage = await db.from('usage_records').select('ai_voice_seconds_used, sms_messages_sent').eq('organization_id', orgId).eq('billing_period_start', monthStart).maybeSingle();
    const u = usage.data as { ai_voice_seconds_used: number; sms_messages_sent: number } | null;
    check('AI voice seconds metered once per call (95 + 3 + 2 = 100)', u?.ai_voice_seconds_used === 100, u);
    check('SMS usage metered for the 2 rescue texts', u?.sms_messages_sent === 2, u);
  } finally {
    server?.kill('SIGTERM');
    await db.from('organizations').delete().eq('id', orgId);
    await db.from('webhook_events').delete().eq('provider', 'vapi').like('event_id', `end-of-call-report:vapi-e2e-${run}-%`);
    await db.from('webhook_events').delete().eq('provider', 'twilio').like('event_id', 'call-status:CAe2eai%');
    console.log(`\nCleaned up test organization ${orgId}.`);
  }

  const failures = failureCount();
  console.log(failures === 0 ? '\nE2E PASSED' : `\nE2E FAILED: ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
