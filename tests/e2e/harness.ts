// Shared helpers for the end-to-end tests (tests/e2e/*.e2e.ts). See module-a.e2e.ts for setup.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import twilio from 'twilio';

export const PORT = 3010;
export const BASE = `http://localhost:${PORT}`;
export const AUTH_TOKEN = 'e2e-twilio-auth-token';

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------
export function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync('.env.local')) return env;
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export const nanp = (area: string) => `+1${area}555${String(randomInt(1000, 9999))}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
export function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && detail !== undefined ? `\n      got: ${JSON.stringify(detail)}` : ''}`);
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 8000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

export async function startServer(env: Record<string, string>): Promise<ChildProcess> {
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
export async function twilioPost(path: string, params: Record<string, string>, opts: { forge?: boolean } = {}) {
  const url = `${BASE}${path}`;
  const signature = opts.forge ? 'forged' : twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, params);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature },
    body: new URLSearchParams(params).toString(),
  });
  return { status: res.status, body: await res.text() };
}


export function failureCount(): number {
  return failures;
}

// Refuses to run without the explicit write flag and real (non-template) service credentials.
export function connectTestDatabase(): SupabaseClient {
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
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}
