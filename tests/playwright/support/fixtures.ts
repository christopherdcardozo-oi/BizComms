// Shared Playwright fixtures: a service-role database client (for seeding and for asserting on
// the rows the app writes) and a throwaway business with an owner login, created per test file
// and deleted afterwards. Requires a TEST Supabase project in .env.local.
import { randomBytes, randomInt } from 'node:crypto';
import fs from 'node:fs';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { BASE_URL, TEST_TWILIO_AUTH_TOKEN } from '../../../playwright.config';

function envLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync('.env.local')) return env;
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*(#.*)?$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export function connectTestDatabase(): SupabaseClient {
  if (process.env.E2E_ALLOW_SUPABASE_WRITES !== '1') {
    throw new Error('Refusing to run: these tests write to Supabase. Use `npm run test:pw` against a TEST project.');
  }
  const env = { ...envLocal(), ...process.env } as Record<string, string | undefined>;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.includes('local-service-role-key')) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (a TEST project).');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// 555 exchange numbers with random suffixes, so concurrent runs and seeded businesses never collide.
export const fakeNumber = (area: string) => `+1${area}555${String(randomInt(1000, 10000))}`;
export const uniqueCallSid = (label: string) => `CApw${label}${randomInt(100000, 999999)}`;

export interface SeededBusiness {
  orgId: string;
  userId: string;
  name: string;
  email: string;
  password: string;
  businessNumber: string;
  ownerCell: string;
  aiCaller: string; // has a seeded AI call with a transcript
  texter: string; // has an inbound text waiting for a reply
}

const ALL_DAY = { open: '00:00', close: '00:00', closed: false };
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Seeding ${what} failed: ${result.error.message}`);
  return result.data;
}

export async function seedBusiness(db: SupabaseClient, name: string): Promise<SeededBusiness> {
  const org = must(
    await db
      .from('organizations')
      .insert({
        name,
        slug: `pw-${randomInt(100000, 999999)}`,
        timezone: 'America/Chicago',
        business_hours: Object.fromEntries(WEEK.map((d) => [d, ALL_DAY])),
        subscription_status: 'active',
        stripe_subscription_id: 'sub_playwright',
      })
      .select('id')
      .single(),
    'organization'
  ) as { id: string };

  const email = `pw-${randomBytes(6).toString('hex')}@example.test`;
  const password = `Pw-${randomBytes(12).toString('base64url')}`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Seeding user failed: ${created.error?.message}`);
  const userId = created.data.user.id;
  // The auth trigger creates public.users as a member with no org; make them this org's owner.
  must(await db.from('users').update({ organization_id: org.id, role: 'owner' }).eq('id', userId), 'owner link');

  const businessNumber = fakeNumber('515');
  const ownerCell = fakeNumber('312');
  const aiCaller = fakeNumber('641');
  const texter = fakeNumber('319');

  must(
    await db.from('twilio_configs').insert({
      organization_id: org.id,
      is_primary: true,
      twilio_phone_number: businessNumber,
      twilio_phone_sid: 'PNplaywright',
      forward_to_number: ownerCell,
      forward_timeout_seconds: 15,
      ai_voice_enabled: false,
      after_hours_direct_to_ai: false,
    }),
    'phone line'
  );
  must(await db.from('a2p_registrations').insert({ organization_id: org.id, status: 'approved', messaging_service_sid: 'MGplaywright' }), 'A2P');
  must(
    await db.from('call_logs').insert({
      organization_id: org.id,
      call_sid: uniqueCallSid('seedai'),
      from_number: aiCaller,
      to_number: businessNumber,
      status: 'completed',
      outcome: 'ai_conversation_completed',
      duration_seconds: 95,
      ai_summary: 'Water heater leaking in the basement. Wants someone today.',
      transcript: "AI: Thanks for calling. You've reached our automated assistant, and this call may be recorded.\nCaller: My water heater is leaking.",
    }),
    'AI call'
  );
  must(
    await db.from('messages').insert({
      organization_id: org.id,
      from_number: texter,
      to_number: businessNumber,
      body: 'Is this the plumber? Need a quote on a 50 gallon water heater.',
      direction: 'inbound',
      status: 'received',
      type: 'manual_chat',
    }),
    'inbound text'
  );

  return { orgId: org.id, userId, name, email, password, businessNumber, ownerCell, aiCaller, texter };
}

export async function removeBusiness(db: SupabaseClient, b: SeededBusiness | undefined) {
  if (!b) return;
  // Cascades to lines, call logs, messages, opt-outs, A2P and usage rows.
  await db.from('organizations').delete().eq('id', b.orgId);
  await db.auth.admin.deleteUser(b.userId);
  await db.from('webhook_events').delete().eq('provider', 'twilio').like('event_id', '%CApw%');
}

export async function signIn(page: Page, b: Pick<SeededBusiness, 'email' | 'password'>) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(b.email);
  await page.getByLabel('Password').fill(b.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// Signs exactly like Twilio: HMAC-SHA1 over the full public URL plus the sorted POST params.
export async function postTwilio(
  request: APIRequestContext,
  path: string,
  params: Record<string, string>,
  opts: { signature?: string } = {}
) {
  const url = `${BASE_URL}${path}`;
  const signature = opts.signature ?? twilio.getExpectedTwilioSignature(TEST_TWILIO_AUTH_TOKEN, url, params);
  return request.post(path, {
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    data: new URLSearchParams(params).toString(),
  });
}

// Polls until the row matches: webhook handlers write in the background after responding.
export async function eventually<T>(read: () => Promise<T | null | undefined>, ok: (v: T) => boolean = () => true, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  let last: T | null | undefined;
  while (Date.now() < end) {
    last = await read();
    if (last && ok(last)) return last;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Condition not met within ${ms}ms. Last value: ${JSON.stringify(last)}`);
}

type WorkerFixtures = { db: SupabaseClient; business: SeededBusiness; otherBusiness: SeededBusiness };

export const test = base.extend<object, WorkerFixtures>({
  db: [async ({}, use) => use(connectTestDatabase()), { scope: 'worker' }],
  business: [
    async ({ db }, use) => {
      const b = await seedBusiness(db, `PW Plumbing ${randomInt(1000, 9999)}`);
      try {
        await use(b);
      } finally {
        await removeBusiness(db, b);
      }
    },
    { scope: 'worker' },
  ],
  otherBusiness: [
    async ({ db }, use) => {
      const b = await seedBusiness(db, `PW Other Roofing ${randomInt(1000, 9999)}`);
      try {
        await use(b);
      } finally {
        await removeBusiness(db, b);
      }
    },
    { scope: 'worker' },
  ],
});

export { expect };
