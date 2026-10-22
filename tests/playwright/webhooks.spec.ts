// Twilio webhooks over real HTTP with real signature checks, asserting on call_logs, messages and
// sms_opt_outs. Outgoing texts go through the mock sender (USE_MOCK_SMS=true in
// playwright.config.ts): the app records each text with a SM_mock_ id instead of calling Twilio.
import { eventually, expect, postTwilio, test, uniqueCallSid } from './support/fixtures';

test.describe('Twilio webhooks', () => {
  test('an unsigned request (no X-Twilio-Signature) is rejected and writes nothing', async ({ request, db, business }) => {
    const CallSid = uniqueCallSid('unsigned');
    const res = await request.post('/api/incoming-call', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({ CallSid, From: '+15551234567', To: business.businessNumber, CallStatus: 'ringing', Direction: 'inbound' }).toString(),
    });
    expect(res.status()).toBe(403);
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await db.from('call_logs').select('id').eq('call_sid', CallSid);
    expect(data).toHaveLength(0);
  });

  test('a forged signature is rejected', async ({ request, business }) => {
    const res = await postTwilio(request, '/api/incoming-call', { CallSid: uniqueCallSid('forged'), From: '+15551234567', To: business.businessNumber }, { signature: 'forged' });
    expect(res.status()).toBe(403);
  });

  test('a signed call to an unknown number is rejected politely', async ({ request }) => {
    const res = await postTwilio(request, '/api/incoming-call', { CallSid: uniqueCallSid('unknown'), From: '+15551234567', To: '+19995550123' });
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<Reject/>');
  });

  test('a malformed payload (no CallSid) is refused', async ({ request, business }) => {
    const res = await postTwilio(request, '/api/incoming-call', { From: '+15551234567', To: business.businessNumber });
    expect(res.status()).toBe(400);
  });

  test("a signed incoming call rings the owner's phone and logs the call", async ({ request, db, business }) => {
    const CallSid = uniqueCallSid('ring');
    const res = await postTwilio(request, '/api/incoming-call', { CallSid, From: '+15551230001', To: business.businessNumber, CallStatus: 'ringing' });
    expect(res.status()).toBe(200);
    const twiml = await res.text();
    expect(twiml).toContain('<Response>');
    expect(twiml).toContain(`<Number>${business.ownerCell}</Number>`);
    expect(twiml).toContain('timeout="15"');

    const log = await eventually(async () => (await db.from('call_logs').select('*').eq('call_sid', CallSid).maybeSingle()).data);
    expect(log).toMatchObject({ organization_id: business.orgId, status: 'ringing', from_number: '+15551230001' });
  });

  test('a missed call sends exactly one text-back, recorded by the mock sender', async ({ request, db, business }) => {
    const CallSid = uniqueCallSid('missed');
    const caller = '+15551230002';
    await postTwilio(request, '/api/incoming-call', { CallSid, From: caller, To: business.businessNumber });
    const missed = await postTwilio(request, '/api/incoming-call/action?leg=forward', { CallSid, From: caller, To: business.businessNumber, DialCallStatus: 'no-answer' });
    const twiml = await missed.text();
    expect(twiml).toContain('<Say>');
    expect(twiml).toContain('<Hangup/>');

    const log = await eventually(
      async () => (await db.from('call_logs').select('outcome, sms_rescued').eq('call_sid', CallSid).maybeSingle()).data,
      (r) => r.outcome === 'missed_call_texted'
    );
    expect(log.sms_rescued).toBe(true);

    const texts = async () => (await db.from('messages').select('*').eq('organization_id', business.orgId).eq('to_number', caller)).data ?? [];
    const sent = await eventually(texts, (rows) => rows.length > 0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from_number: business.businessNumber, type: 'missed_call_auto_reply', direction: 'outbound_api' });
    expect(sent[0].body).toContain(business.name);
    expect(sent[0].body).toMatch(/Reply STOP/);
    expect(String(sent[0].message_sid)).toMatch(/^SM_mock_/);

    // Twilio redelivers callbacks; the caller must still get only one text.
    await postTwilio(request, '/api/incoming-call/action?leg=forward', { CallSid, From: caller, To: business.businessNumber, DialCallStatus: 'no-answer' });
    await new Promise((r) => setTimeout(r, 2500));
    expect(await texts()).toHaveLength(1);
  });

  test('STOP opts the caller out, and their next missed call is not texted', async ({ request, db, business }) => {
    const caller = '+15551230003';
    const stop = await postTwilio(request, '/api/sms/webhook', { MessageSid: `SMpw${Date.now()}`, From: caller, To: business.businessNumber, Body: 'STOP' });
    expect(stop.status()).toBe(200);
    const optOut = await eventually(
      async () => (await db.from('sms_opt_outs').select('source').eq('organization_id', business.orgId).eq('phone_number', caller).maybeSingle()).data
    );
    expect(optOut.source).toBe('inbound_stop');

    const CallSid = uniqueCallSid('optedout');
    await postTwilio(request, '/api/incoming-call', { CallSid, From: caller, To: business.businessNumber });
    await postTwilio(request, '/api/incoming-call/action?leg=forward', { CallSid, From: caller, To: business.businessNumber, DialCallStatus: 'canceled' });
    await new Promise((r) => setTimeout(r, 3000));
    const { data: texts } = await db.from('messages').select('id').eq('organization_id', business.orgId).eq('to_number', caller).eq('direction', 'outbound_api');
    expect(texts).toHaveLength(0);
  });
});

test.describe('Owner texting command center', () => {
  test('a customer text alerts the owner; the owner replies "won 650" and the job is logged', async ({ request, db, business }) => {
    const customer = '+15551230004';
    await postTwilio(request, '/api/sms/webhook', { MessageSid: `SMpwc${Date.now()}`, From: customer, To: business.businessNumber, Body: 'Need a water heater quote' });

    const alert = await eventually(
      async () => (await db.from('messages').select('*').eq('organization_id', business.orgId).eq('to_number', business.ownerCell).eq('type', 'system_alert').like('body', '%(555) 123-0004%').maybeSingle()).data
    );
    expect(alert.body).toContain('New text from');
    expect(alert.body).toContain('Reply 1 to call them');
    expect(String(alert.message_sid)).toMatch(/^SM_mock_/);

    const reply = await postTwilio(request, '/api/sms/webhook', { MessageSid: `SMpwo${Date.now()}`, From: business.ownerCell, To: business.businessNumber, Body: 'won 650' });
    expect(await reply.text()).toMatch(/Logged a \$650 job from .*Recovered this month: \$650/);

    const { data: jobs } = await db.from('jobs_won').select('amount_cents, contact_number').eq('organization_id', business.orgId);
    expect(jobs).toEqual([{ amount_cents: 65000, contact_number: customer }]);

    // The owner's command text is not a customer conversation in the inbox.
    const { data: ownerMsg } = await db.from('messages').select('type').eq('organization_id', business.orgId).eq('from_number', business.ownerCell).single();
    expect(ownerMsg?.type).toBe('system_alert');
  });
});
