// Creates a TEST AI receptionist in your Vapi account (re-running --create updates it in place) using the
// exact same assistant + SIP phone-number configuration the app provisions for customers.
// Afterwards, open the assistant in the Vapi dashboard and click "Talk" to hear it answer.
//
//   npx sucrase-node scripts/vapi-test-receptionist.ts --check        # verify the API key only (read-only)
//   npx sucrase-node scripts/vapi-test-receptionist.ts --create       # create the test receptionist
//
// The test receptionist ids are kept in .vapi-test.json (git-ignored) so re-runs update in place.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { VapiProvider } from '../src/lib/providers/voice-ai/vapi';
import { receptionistGreeting, receptionistPrompt } from '../src/lib/voice/receptionist';
import { vapiSipUri } from '../src/lib/voice/sip';

const STATE_FILE = '.vapi-test.json';

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(l);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const e = env();
  const apiKey = e.VAPI_API_KEY;
  if (!apiKey || apiKey.startsWith('vapi_live_your')) {
    console.error('VAPI_API_KEY is not set in .env.local. Run: python3 scripts/set_secret.py VAPI_API_KEY');
    process.exit(2);
  }

  // Read-only key check: list at most one assistant.
  const res = await fetch('https://api.vapi.ai/assistant?limit=1', { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 401 || res.status === 403) {
    console.error(`Vapi rejected the key (${res.status}). Use the PRIVATE API key, not the public one.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Vapi API check failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  console.log('✓ Vapi private API key works (read-only check).');
  if (process.argv.includes('--check')) return;
  if (!process.argv.includes('--create')) {
    console.log('Pass --create to create the test receptionist.');
    return;
  }

  const state = fs.existsSync(STATE_FILE)
    ? (JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as { organizationId: string; assistantId: string; phoneNumberId: string })
    : null;
  const organizationId = state?.organizationId ?? randomUUID();
  const businessName = 'BizComms Test Plumbing';
  const base = (e.TWILIO_WEBHOOK_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

  const provider = new VapiProvider({
    apiKey,
    webhookCredentialId: e.VAPI_WEBHOOK_CREDENTIAL_ID || undefined,
    webhookSecret: e.VAPI_WEBHOOK_SECRET || undefined,
  });
  const ids = await provider.upsertReceptionist(
    {
      organizationId,
      businessName,
      systemPrompt: receptionistPrompt(businessName, 'We offer 24/7 emergency plumbing in the Chicago area.'),
      firstMessage: receptionistGreeting(businessName),
      sipUri: vapiSipUri(organizationId, e.VAPI_SIP_ENDPOINT || 'sip.vapi.ai'),
      webhookUrl: `${base}/api/vapi/webhook`,
    },
    state ? { assistantId: state.assistantId, phoneNumberId: state.phoneNumberId } : undefined
  );
  fs.writeFileSync(STATE_FILE, JSON.stringify({ organizationId, ...ids }, null, 2));

  console.log(`✓ Test receptionist ${state ? 'updated' : 'created'} in Vapi`);
  console.log(`  assistant id:     ${ids.assistantId}`);
  console.log(`  SIP phone number: ${vapiSipUri(organizationId, e.VAPI_SIP_ENDPOINT || 'sip.vapi.ai')} (id ${ids.phoneNumberId})`);
  console.log(`  webhook URL:      ${base}/api/vapi/webhook${base.includes('localhost') ? '  (not reachable by Vapi until the app has a public URL)' : ''}`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
