// Module E unit tests: number provisioning, fail-open URL signing, phone normalization,
// inbox replies and conversation grouping. Run with: npx sucrase-node tests/dashboard.test.ts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { groupConversations, type InboxMessage } from '../src/lib/dashboard/conversations';
import { buildFailOpenUrl } from '../src/lib/numbers/fallback-url';
import { formatNanp, normalizeNanpNumber } from '../src/lib/numbers/phone';
import { provisionNumber, type LineStore } from '../src/lib/numbers/provision';
import { MockNumberProvisioningProvider } from '../src/lib/providers/numbers/mock';
import { sendManualReply } from '../src/lib/sms/outbound';
import { handleDialAction } from '../src/lib/telephony/handlers';
import { CALL, LINE, makeDeps, runAll } from './support/telephony-fakes';

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------
test('normalizeNanpNumber accepts common US formats and rejects international/invalid', () => {
  for (const input of ['(312) 555-0123', '312.555.0123', '+1 312 555 0123', '13125550123']) {
    assert.equal(normalizeNanpNumber(input), '+13125550123', input);
  }
  for (const input of ['555-0123', '+44 20 7946 0958', '(012) 555-0123', 'call me']) {
    assert.equal(normalizeNanpNumber(input), null, input);
  }
  assert.equal(formatNanp('+13125550123'), '(312) 555-0123');
});

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------
class FakeLineStore implements LineStore {
  lines: Array<{ organizationId: string; twilioPhoneNumber: string; twilioPhoneSid: string; forwardToNumber: string }> = [];
  failInsert = false;
  async organizationHasLine(org: string) {
    return this.lines.some((l) => l.organizationId === org);
  }
  async insertPrimaryLine(input: FakeLineStore['lines'][number]) {
    if (this.failInsert) throw new Error('unique violation');
    this.lines.push(input);
  }
}

function provisioning() {
  const provider = new MockNumberProvisioningProvider();
  const store = new FakeLineStore();
  const errors: string[] = [];
  const deps = {
    provider,
    store,
    webhooks: (forwardTo: string) => ({
      voiceUrl: 'https://app.test/api/incoming-call',
      voiceFallbackUrl: `https://fallback.test/fail-open?to=${forwardTo}`,
      statusCallback: 'https://app.test/api/incoming-call/status',
      smsUrl: 'https://app.test/api/sms/webhook',
    }),
    logger: { error: (m: string) => void errors.push(m) },
  };
  return { provider, store, deps, errors };
}

test('provision: buys the number with all webhooks and records it for the org', async () => {
  const { provider, store, deps } = provisioning();
  const result = await provisionNumber({ organizationId: 'org-1', phoneNumber: '+13125550100', forwardToNumber: '+13125559999' }, deps);
  assert.deepEqual(result, { ok: true, phoneNumber: '+13125550100' });
  assert.equal(provider.purchased[0].webhooks.smsUrl, 'https://app.test/api/sms/webhook');
  assert.equal(provider.purchased[0].webhooks.voiceFallbackUrl, 'https://fallback.test/fail-open?to=+13125559999');
  assert.equal(store.lines[0].twilioPhoneSid, 'PN_mock_13125550100');
});

test('provision: one number per org, and never forward the number to itself', async () => {
  const { provider, deps } = provisioning();
  await provisionNumber({ organizationId: 'org-1', phoneNumber: '+13125550100', forwardToNumber: '+13125559999' }, deps);
  const second = await provisionNumber({ organizationId: 'org-1', phoneNumber: '+13125550101', forwardToNumber: '+13125559999' }, deps);
  assert.deepEqual(second, { ok: false, error: 'already_has_number' });
  const loop = await provisionNumber({ organizationId: 'org-2', phoneNumber: '+13125550102', forwardToNumber: '+13125550102' }, deps);
  assert.deepEqual(loop, { ok: false, error: 'invalid_forward_number' });
  const intl = await provisionNumber({ organizationId: 'org-2', phoneNumber: '+13125550102', forwardToNumber: '+442079460958' }, deps);
  assert.deepEqual(intl, { ok: false, error: 'invalid_forward_number' });
  assert.equal(provider.purchased.length, 1, 'no purchase attempted for rejected requests');
});

test('provision: if saving fails after purchase, the number is released (no orphaned billing)', async () => {
  const { provider, store, deps } = provisioning();
  store.failInsert = true;
  const result = await provisionNumber({ organizationId: 'org-1', phoneNumber: '+13125550100', forwardToNumber: '+13125559999' }, deps);
  assert.deepEqual(result, { ok: false, error: 'save_failed' });
  assert.deepEqual(provider.released, ['PN_mock_13125550100']);
});

test('provision: purchase failure records nothing', async () => {
  const { provider, store, deps } = provisioning();
  provider.purchase = async () => {
    throw new Error('21422: number not available');
  };
  const result = await provisionNumber({ organizationId: 'org-1', phoneNumber: '+13125550100', forwardToNumber: '+13125559999' }, deps);
  assert.deepEqual(result, { ok: false, error: 'purchase_failed' });
  assert.equal(store.lines.length, 0);
});

test('fail-open URL is HMAC-signed for exactly one destination, and absent without config', () => {
  const url = new URL(buildFailOpenUrl('+13125559999', { workerUrl: 'https://fallback.test/fail-open', signingSecret: 's3cret' })!);
  assert.equal(url.searchParams.get('to'), '+13125559999');
  assert.equal(url.searchParams.get('sig'), createHmac('sha256', 's3cret').update('+13125559999').digest('hex'));
  assert.equal(buildFailOpenUrl('+13125559999', { workerUrl: 'https://fallback.test/fail-open' }), undefined);
});

// ---------------------------------------------------------------------------
// Inbox replies
// ---------------------------------------------------------------------------
const reply = (body: string, to = CALL.From) => ({ organizationId: LINE.organizationId, fromNumber: LINE.twilioPhoneNumber, to, body });

test('reply: refuses cold outreach to someone who never called or texted', async () => {
  const { deps, sms } = makeDeps();
  assert.deepEqual(await sendManualReply(reply('Hi!', '+13125550777'), deps), { ok: false, error: 'no_prior_contact' });
  assert.equal(sms.sentMessages.length, 0);
});

test('reply: sends to a prior caller, records a manual_chat message, and meters usage', async () => {
  const { deps, repo, sms } = makeDeps();
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'completed' }, 'forward', deps)); // creates call log
  const result = await sendManualReply(reply('  We can be there at 3pm.  '), deps);
  assert.equal(result.ok, true);
  assert.equal(sms.sentMessages[0].body, 'We can be there at 3pm.');
  assert.equal(sms.sentMessages[0].messagingServiceSid, 'MG123');
  assert.equal(repo.messages.at(-1)?.type, 'manual_chat');
  assert.equal(repo.smsUsage, 1);
});

test('reply: honors opt-out, A2P approval, length and kill switch', async () => {
  const { deps, repo } = makeDeps();
  await runAll(await handleDialAction({ ...CALL, DialCallStatus: 'completed' }, 'forward', deps));

  repo.optOuts.add(`${LINE.organizationId}:${CALL.From}`);
  assert.deepEqual(await sendManualReply(reply('Hi'), deps), { ok: false, error: 'opted_out' });
  repo.optOuts.clear();

  repo.a2p = { status: 'pending', messagingServiceSid: null };
  assert.deepEqual(await sendManualReply(reply('Hi'), deps), { ok: false, error: 'a2p_not_approved' });
  repo.a2p = { status: 'approved', messagingServiceSid: 'MG123' };

  assert.deepEqual(await sendManualReply(reply('x'.repeat(641)), deps), { ok: false, error: 'too_long' });
  assert.deepEqual(await sendManualReply(reply('   '), deps), { ok: false, error: 'empty' });
  assert.deepEqual(await sendManualReply(reply('Hi'), { ...deps, killSwitch: true }), { ok: false, error: 'disabled' });
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
test('groupConversations: one row per customer, newest first, flags who spoke last', () => {
  const msg = (id: string, direction: 'inbound' | 'outbound_api', other: string, at: string): InboxMessage => ({
    id,
    direction,
    from_number: direction === 'inbound' ? other : LINE.twilioPhoneNumber,
    to_number: direction === 'inbound' ? LINE.twilioPhoneNumber : other,
    body: id,
    status: direction === 'inbound' ? 'received' : 'delivered',
    type: direction === 'inbound' ? 'manual_chat' : 'missed_call_auto_reply',
    error_code: null,
    created_at: at,
  });
  const conversations = groupConversations([
    msg('a3', 'inbound', '+13125550001', '2026-10-20T12:03:00Z'),
    msg('b2', 'outbound_api', '+13125550002', '2026-10-20T12:02:00Z'),
    msg('a2', 'outbound_api', '+13125550001', '2026-10-20T12:01:00Z'),
    msg('b1', 'inbound', '+13125550002', '2026-10-20T12:00:00Z'),
  ]);
  assert.deepEqual(
    conversations.map((c) => [c.contact, c.lastMessage.id, c.messageCount, c.awaitingReply]),
    [
      ['+13125550001', 'a3', 2, true],
      ['+13125550002', 'b2', 2, false],
    ]
  );
});
