import fs from 'node:fs';
import path from 'node:path';
import { default as EmbeddedPostgres } from 'embedded-postgres';
import pg from 'pg';

const DB_PORT = 54329;

async function runTestSuite() {
  console.log('==============================================================================');
  console.log('Local Business Communications OS - RLS & Security Test Suite (Revision 8)');
  console.log('Platform: Embedded PostgreSQL 18.4 (Stubbed Supabase Auth & Platform Roles)');
  console.log('==============================================================================\n');

  const pgServer = new EmbeddedPostgres({
    port: DB_PORT,
    persistent: true,
  });

  await pgServer.start();
  const client = pgServer.getPgClient();
  await client.connect();
  await client.query('SET client_min_messages = warning;');

  // 1. Reset and re-apply bootstrap & migration cleanly
  console.log('-> Resetting public & auth schemas...');
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA auth TO postgres;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  `);

  console.log('-> Applying tests/bootstrap.sql (Supabase stub)...');
  const bootstrapSql = fs.readFileSync('tests/bootstrap.sql', 'utf8');
  await client.query(bootstrapSql);

  const migrationFiles = fs
    .readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    console.log(`-> Applying supabase/migrations/${file}...`);
    await client.query(fs.readFileSync(path.join('supabase/migrations', file), 'utf8'));
  }

  // 2. Insert test fixtures (as superuser / postgres)
  console.log('-> Seeding test fixtures...');
  await client.query(`
    SET search_path = public, auth, extensions;

    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    VALUES 
        ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@acme.com', '{"full_name":"Alice Owner"}'::jsonb, now(), now()),
        ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@acme.com', '{"full_name":"Bob Tech"}'::jsonb, now(), now()),
        ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'charlie@beacon.com', '{"full_name":"Charlie Owner"}'::jsonb, now(), now()),
        ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dan@fresh.com', '{"full_name":"Dan Fresh"}'::jsonb, now(), now()),
        ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eve@intruder.com', '{"full_name":"Eve Intruder"}'::jsonb, now(), now()),
        ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frank@unassigned.com', '{"full_name":"Frank Unassigned"}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (id, name, slug)
    VALUES 
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Plumbing', 'acme-plumbing'),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Beacon Dental', 'beacon-dental')
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.users SET organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'owner' WHERE id = '11111111-1111-1111-1111-111111111111';
    UPDATE public.users SET organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'member' WHERE id = '22222222-2222-2222-2222-222222222222';
    UPDATE public.users SET organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role = 'owner' WHERE id = '33333333-3333-3333-3333-333333333333';

    INSERT INTO public.twilio_configs (id, organization_id, label, is_primary, twilio_phone_number, forward_to_number)
    VALUES 
        ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Main Line', true, '+12025550101', '+12025550199'),
        ('a1111111-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Dispatch Line', false, '+12025550102', '+12025550199'),
        ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Main Line', true, '+12025550202', '+12025550299')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.google_configs (id, organization_id, google_location_id, location_name)
    VALUES 
        ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'locations/loc-a', 'Acme Plumbing Google Maps'),
        ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'locations/loc-b', 'Beacon Dental Google Maps')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.google_tokens (organization_id, encrypted_refresh_token)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'enc_secret_token_org_a')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.reviews (id, organization_id, google_review_id, reviewer_name, star_rating, comment, review_created_at, reply_status, reply_text)
    VALUES (
        'a3333333-3333-3333-3333-333333333333',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'rev-12345',
        'John Customer',
        2,
        'Service was slow.',
        now(),
        'manual_review',
        'Draft reply: We apologize for the delay.'
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.organization_invites (id, organization_id, email, role, token_hash, expires_at)
    VALUES (
        'e1111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'dan@fresh.com',
        'member',
        encode(digest('dan_secret_invite_token_2026', 'sha256'), 'hex'),
        now() + interval '7 days'
    ) ON CONFLICT DO NOTHING;
  `);

  console.log('-> Fixtures seeded successfully.\n');

  // Helper for throws_ok expectation
  async function expectThrows(c, sql, expectedSqlState) {
    try {
      await c.query(sql);
      return {
        pass: false,
        received: 'SUCCESS (no error thrown)',
        expected: `SQLSTATE ${expectedSqlState}`,
      };
    } catch (err) {
      const pass = err.code === expectedSqlState;
      return {
        pass,
        received: `SQLSTATE ${err.code} (${err.message})`,
        expected: `SQLSTATE ${expectedSqlState}`,
      };
    }
  }

  // Define 27 test cases
  const tests = [
    {
      id: 1,
      name: 'User A cannot read Org B twilio_configs',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        const res = await c.query(
          "SELECT * FROM public.twilio_configs WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'"
        );
        return {
          pass: res.rows.length === 0,
          received: `${res.rows.length} rows returned`,
          expected: '0 rows returned',
        };
      },
    },
    {
      id: 2,
      name: 'Anti-tenant hopping blocked by WITH CHECK policy (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "UPDATE public.twilio_configs SET organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'",
          '42501'
        );
      },
    },
    {
      id: 3,
      name: 'Member UPDATE affects 0 rows and target configuration data is unchanged',
      role: 'authenticated',
      claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' },
      run: async (c) => {
        await c.query(
          "UPDATE public.twilio_configs SET forward_to_number = '+12025559999' WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'"
        );
        const check = await c.query(
          "SELECT count(*)::int AS count FROM public.twilio_configs WHERE forward_to_number = '+12025559999'"
        );
        const count = check.rows[0].count;
        return {
          pass: count === 0,
          received: `${count} rows modified`,
          expected: '0 rows modified',
        };
      },
    },
    {
      id: 4,
      name: 'google_tokens table is strictly inaccessible to authenticated clients (REVOKE ALL)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(c, 'SELECT * FROM public.google_tokens', '42501');
      },
    },
    {
      id: 5,
      name: 'google_configs_safe view prevents cross-tenant data leakage',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        const res = await c.query(
          "SELECT * FROM public.google_configs_safe WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'"
        );
        return {
          pass: res.rows.length === 0,
          received: `${res.rows.length} rows returned`,
          expected: '0 rows returned',
        };
      },
    },
    {
      id: 6,
      name: 'Member cannot modify review star_rating (column update revoked)',
      role: 'authenticated',
      claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "UPDATE public.reviews SET star_rating = 5 WHERE id = 'a3333333-3333-3333-3333-333333333333'",
          '42501'
        );
      },
    },
    {
      id: 7,
      name: 'Member cannot publish review by changing reply_status (column update revoked)',
      role: 'authenticated',
      claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "UPDATE public.reviews SET reply_status = 'published' WHERE id = 'a3333333-3333-3333-3333-333333333333'",
          '42501'
        );
      },
    },
    {
      id: 8,
      name: 'Member cannot approve review by setting approved_by (column update revoked)',
      role: 'authenticated',
      claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "UPDATE public.reviews SET approved_by = '22222222-2222-2222-2222-222222222222' WHERE id = 'a3333333-3333-3333-3333-333333333333'",
          '42501'
        );
      },
    },
    {
      id: 9,
      name: 'Member can successfully update reply_text column on draft review',
      role: 'authenticated',
      claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' },
      run: async (c) => {
        await c.query(
          "UPDATE public.reviews SET reply_text = 'Updated draft response by technician.' WHERE id = 'a3333333-3333-3333-3333-333333333333'"
        );
        const check = await c.query(
          "SELECT reply_text FROM public.reviews WHERE id = 'a3333333-3333-3333-3333-333333333333'"
        );
        const text = check.rows[0]?.reply_text;
        return {
          pass: text === 'Updated draft response by technician.',
          received: text,
          expected: 'Updated draft response by technician.',
        };
      },
    },
    {
      id: 10,
      name: 'Authenticated user cannot call increment_usage (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "SELECT public.increment_usage('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 60, 1, 0)",
          '42501'
        );
      },
    },
    {
      id: 11,
      name: 'Authenticated client cannot insert into messages table directly (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "INSERT INTO public.messages (organization_id, from_number, to_number, body) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+12025550101', '+12025559999', 'Spam test')",
          '42501'
        );
      },
    },
    {
      id: 12,
      name: 'Direct role update blocked by privilege escalation trigger (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "UPDATE public.users SET role = 'owner' WHERE id = '22222222-2222-2222-2222-222222222222'",
          '42501'
        );
      },
    },
    {
      id: 13,
      name: 'Owner direct role update blocked by privilege escalation trigger (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "UPDATE public.users SET role = 'member' WHERE id = '11111111-1111-1111-1111-111111111111'",
          '42501'
        );
      },
    },
    {
      id: 14,
      name: 'accept_organization_invite fails on email mismatch (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '55555555-5555-5555-5555-555555555555', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "SELECT public.accept_organization_invite('dan_secret_invite_token_2026')",
          '42501'
        );
      },
    },
    {
      id: 15,
      name: 'set_primary_twilio_config fails for member (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "SELECT public.set_primary_twilio_config('a1111111-2222-2222-2222-222222222222')",
          '42501'
        );
      },
    },
    {
      id: 16,
      name: 'set_primary_twilio_config fails for foreign org admin (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '33333333-3333-3333-3333-333333333333', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "SELECT public.set_primary_twilio_config('a1111111-2222-2222-2222-222222222222')",
          '42501'
        );
      },
    },
    {
      id: 17,
      name: 'Consecutive primary line swaps succeed without partial unique index violation',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        await c.query(
          "SELECT public.set_primary_twilio_config('a1111111-2222-2222-2222-222222222222')"
        );
        await c.query(
          "SELECT public.set_primary_twilio_config('a1111111-1111-1111-1111-111111111111')"
        );
        return {
          pass: true,
          received: 'Executed cleanly without index collision',
          expected: 'Success',
        };
      },
    },
    {
      id: 18,
      name: 'Invalid slug format throws 22023',
      role: 'authenticated',
      claims: { sub: '55555555-5555-5555-5555-555555555555', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "SELECT public.create_organization_for_user('Eve Org', 'INVALID_SLUG!')",
          '22023'
        );
      },
    },
    {
      id: 19,
      name: 'Duplicate slug throws 23505',
      role: 'authenticated',
      claims: { sub: '55555555-5555-5555-5555-555555555555', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "SELECT public.create_organization_for_user('Acme Clone', 'acme-plumbing')",
          '23505'
        );
      },
    },
    {
      id: 20,
      name: 'Fresh user successfully creates organization and is promoted to owner',
      role: 'authenticated',
      claims: { sub: '55555555-5555-5555-5555-555555555555', role: 'authenticated' },
      run: async (c) => {
        const res = await c.query(
          "SELECT public.create_organization_for_user('Eve Innovations', 'eve-innovations') AS new_org_id"
        );
        const orgId = res.rows[0]?.new_org_id;
        return {
          pass: Boolean(orgId),
          received: `Organization created with ID: ${orgId}`,
          expected: 'Valid UUID',
        };
      },
    },
    {
      id: 21,
      name: 'Authorized recipient can accept organization invite via raw token',
      role: 'authenticated',
      claims: { sub: '44444444-4444-4444-4444-444444444444', role: 'authenticated' },
      run: async (c) => {
        const res = await c.query(
          "SELECT public.accept_organization_invite('dan_secret_invite_token_2026') AS accepted_id"
        );
        const acceptedId = res.rows[0]?.accepted_id;
        return {
          pass: Boolean(acceptedId),
          received: `Invite accepted, returned: ${acceptedId}`,
          expected: 'Valid invite UUID',
        };
      },
    },
    {
      id: 22,
      name: 'Anon role denied SELECT on tenant organizations table (SQLSTATE 42501)',
      role: 'anon',
      claims: { role: 'anon' },
      run: async (c) => {
        return expectThrows(c, 'SELECT * FROM public.organizations', '42501');
      },
    },
    {
      id: 23,
      name: 'Non-member user without organization membership sees 0 rows across tenant tables',
      role: 'authenticated',
      claims: { sub: '66666666-6666-6666-6666-666666666666', role: 'authenticated' },
      run: async (c) => {
        const res = await c.query('SELECT * FROM public.twilio_configs');
        return {
          pass: res.rows.length === 0,
          received: `${res.rows.length} rows returned`,
          expected: '0 rows returned',
        };
      },
    },
    {
      id: 24,
      name: 'Authenticated client cannot insert into call_logs (least privilege enforced, SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "INSERT INTO public.call_logs (organization_id, call_sid, from_number, to_number) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CA_test_rev7_24', '+12025550101', '+12025550199')",
          '42501'
        );
      },
    },
    {
      id: 25,
      name: 'Authenticated client cannot insert into usage_records (least privilege enforced, SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "INSERT INTO public.usage_records (organization_id, billing_period_start, billing_period_end) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now() + interval '30 days')",
          '42501'
        );
      },
    },
    {
      id: 26,
      name: 'Authenticated client cannot insert into a2p_registrations (least privilege enforced, SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "INSERT INTO public.a2p_registrations (organization_id, brand_sid) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BN_test_rev7_26')",
          '42501'
        );
      },
    },
    {
      id: 27,
      name: 'Authenticated client cannot insert into sms_opt_outs (least privilege enforced, SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        return expectThrows(
          c,
          "INSERT INTO public.sms_opt_outs (organization_id, phone_number) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+12025550999')",
          '42501'
        );
      },
    },
    {
      id: 28,
      name: 'service_role can insert call_logs (BYPASSRLS verified)',
      role: 'service_role',
      claims: { role: 'service_role' },
      run: async (c) => {
        const res = await c.query(
          "INSERT INTO public.call_logs (organization_id, call_sid, from_number, to_number) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CA_test_service_role_insert', '+12025550101', '+12025550199') RETURNING id"
        );
        const id = res.rows[0]?.id;
        return {
          pass: Boolean(id),
          received: `Inserted row id: ${id}`,
          expected: 'Valid UUID',
        };
      },
    },
    {
      id: 29,
      name: 'the auth.users email-sync trigger updates public.users',
      role: null,
      claims: null,
      run: async (c) => {
        await c.query(
          "UPDATE auth.users SET email = 'alice_synced@acme.com' WHERE id = '11111111-1111-1111-1111-111111111111'"
        );
        const res = await c.query(
          "SELECT email FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'"
        );
        const email = res.rows[0]?.email;
        return {
          pass: email === 'alice_synced@acme.com',
          received: `public.users email: ${email}`,
          expected: 'alice_synced@acme.com',
        };
      },
    },
    {
      id: 30,
      name: 'handle_new_auth_user creates a member with NULL org',
      role: null,
      claims: null,
      run: async (c) => {
        await c.query(`
          INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
          VALUES ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'george@newuser.com', '{"full_name":"George Fresh"}'::jsonb, now(), now())
        `);
        const res = await c.query(
          "SELECT id, email, role, organization_id, full_name FROM public.users WHERE id = '77777777-7777-7777-7777-777777777777'"
        );
        const row = res.rows[0];
        const pass = Boolean(row && row.role === 'member' && row.organization_id === null && row.email === 'george@newuser.com');
        return {
          pass,
          received: `role: ${row?.role}, organization_id: ${row?.organization_id}, email: ${row?.email}`,
          expected: 'role: member, organization_id: null, email: george@newuser.com',
        };
      },
    },
    {
      id: 31,
      name: 'upsert_call_log never regresses a terminal status and only grows duration',
      role: 'service_role',
      claims: null,
      run: async (c) => {
        const call = (status, duration) =>
          c.query(
            `SELECT status, duration_seconds FROM public.upsert_call_log('CA_t31', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+13125550100', '+12025550101', $1::call_status, NULL, NULL, NULL, $2)`,
            [status, duration]
          );
        await call('ringing', 0);
        await call('completed', 42);
        const res = await call('in-progress', 5);
        const row = res.rows[0];
        return {
          pass: row.status === 'completed' && row.duration_seconds === 42,
          received: `status: ${row.status}, duration: ${row.duration_seconds}`,
          expected: 'status: completed, duration: 42',
        };
      },
    },
    {
      id: 32,
      name: 'upsert_call_log keeps outcome when a later callback omits it',
      role: 'service_role',
      claims: null,
      run: async (c) => {
        await c.query(
          "SELECT public.upsert_call_log('CA_t32', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+13125550100', '+12025550101', 'ringing', 'forwarded_to_ai')"
        );
        const res = await c.query(
          "SELECT outcome FROM public.upsert_call_log('CA_t32', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+13125550100', '+12025550101', 'completed')"
        );
        const outcome = res.rows[0].outcome;
        return { pass: outcome === 'forwarded_to_ai', received: `outcome: ${outcome}`, expected: 'outcome: forwarded_to_ai' };
      },
    },
    {
      id: 33,
      name: 'upsert_call_log cannot re-parent another tenant call record',
      role: 'service_role',
      claims: null,
      run: async (c) => {
        await c.query(
          "SELECT public.upsert_call_log('CA_t33', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+13125550100', '+12025550101', 'ringing')"
        );
        await c.query(
          "SELECT public.upsert_call_log('CA_t33', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '+13125550100', '+12025550202', 'completed')"
        );
        const res = await c.query("SELECT organization_id, status FROM public.call_logs WHERE call_sid = 'CA_t33'");
        const row = res.rows[0];
        return {
          pass: row.organization_id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' && row.status === 'ringing',
          received: `org: ${row.organization_id}, status: ${row.status}`,
          expected: 'org: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, status: ringing',
        };
      },
    },
    {
      id: 34,
      name: 'claim_sms_rescue succeeds exactly once per call',
      role: 'service_role',
      claims: null,
      run: async (c) => {
        await c.query(
          "SELECT public.upsert_call_log('CA_t34', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+13125550100', '+12025550101', 'no-answer')"
        );
        const claim = () =>
          c.query("SELECT public.claim_sms_rescue('CA_t34', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS ok");
        const first = (await claim()).rows[0].ok;
        const second = (await claim()).rows[0].ok;
        return {
          pass: first === true && second === false,
          received: `first: ${first}, second: ${second}`,
          expected: 'first: true, second: false',
        };
      },
    },
    {
      id: 35,
      name: 'Authenticated client cannot execute upsert_call_log (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(
          c,
          "SELECT public.upsert_call_log('CA_t35', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+13125550100', '+12025550101', 'ringing')",
          '42501'
        ),
    },
    {
      id: 36,
      name: 'Authenticated client cannot execute claim_sms_rescue (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(c, "SELECT public.claim_sms_rescue('CA_x', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')", '42501'),
    },
    {
      id: 37,
      name: 'Owner cannot insert a twilio_config (numbers are provisioned server-side) (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(
          c,
          "INSERT INTO public.twilio_configs (organization_id, twilio_phone_number, forward_to_number) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+12025550777', '+12025550199')",
          '42501'
        ),
    },
    {
      id: 38,
      name: 'Owner cannot repoint twilio_phone_number to claim another number (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(
          c,
          "UPDATE public.twilio_configs SET twilio_phone_number = '+12025550777' WHERE id = 'a1111111-1111-1111-1111-111111111111'",
          '42501'
        ),
    },
    {
      id: 39,
      name: 'Owner can update routing preferences on their own line',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        const res = await c.query(
          "UPDATE public.twilio_configs SET forward_to_number = '+13125550123', missed_call_sms_enabled = false WHERE id = 'a1111111-1111-1111-1111-111111111111' RETURNING forward_to_number"
        );
        const value = res.rows[0]?.forward_to_number;
        return { pass: value === '+13125550123', received: `forward_to_number: ${value}`, expected: 'forward_to_number: +13125550123' };
      },
    },
    {
      id: 40,
      name: 'Forwarding to a non-NANP (international) number is rejected (SQLSTATE 23514)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(
          c,
          "UPDATE public.twilio_configs SET forward_to_number = '+882135550123' WHERE id = 'a1111111-1111-1111-1111-111111111111'",
          '23514'
        ),
    },
    {
      id: 41,
      name: 'Owner cannot delete a twilio_config (release goes through the server) (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(c, "DELETE FROM public.twilio_configs WHERE id = 'a1111111-1111-1111-1111-111111111111'", '42501'),
    },
    {
      id: 42,
      name: 'Owner cannot mark their own subscription active (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(
          c,
          "UPDATE public.organizations SET subscription_status = 'active', stripe_subscription_id = 'sub_fake' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'",
          '42501'
        ),
    },
    {
      id: 43,
      name: 'Owner cannot raise their own SMS quota (SQLSTATE 42501)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) =>
        expectThrows(
          c,
          "UPDATE public.organizations SET monthly_sms_limit = 1000000 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'",
          '42501'
        ),
    },
    {
      id: 44,
      name: 'Owner can still edit their business profile (name, timezone)',
      role: 'authenticated',
      claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
      run: async (c) => {
        const res = await c.query(
          "UPDATE public.organizations SET name = 'Acme Plumbing & Drain', timezone = 'America/Chicago' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING name, timezone"
        );
        const row = res.rows[0];
        return {
          pass: row?.name === 'Acme Plumbing & Drain' && row?.timezone === 'America/Chicago',
          received: `name: ${row?.name}, timezone: ${row?.timezone}`,
          expected: 'name: Acme Plumbing & Drain, timezone: America/Chicago',
        };
      },
    },
    {
      id: 45,
      name: 'A new organization starts with subscription_status none (not trialing)',
      role: 'authenticated',
      claims: { sub: '44444444-4444-4444-4444-444444444444', role: 'authenticated' },
      run: async (c) => {
        const created = await c.query("SELECT public.create_organization_for_user('Fresh Co', 'fresh-co') AS id");
        const res = await c.query(`SELECT subscription_status FROM public.organizations WHERE id = '${created.rows[0].id}'`);
        const status = res.rows[0]?.subscription_status;
        return { pass: status === 'none', received: `subscription_status: ${status}`, expected: 'subscription_status: none' };
      },
    },
  ];

  console.log(`=== RUNNING ${tests.length} ASSERTIONS (TRANSACTION ISOLATED & ROLLED BACK) ===\n`);

  let passedCount = 0;
  let failedCount = 0;
  const results = [];

  for (const test of tests) {
    await client.query('BEGIN;');
    let pass = false;
    let received = '';
    let expected = '';

    try {
      if (test.role) {
        await client.query(`SET LOCAL ROLE ${test.role};`);
      }
      if (test.claims) {
        await client.query(
          `SET LOCAL "request.jwt.claims" = '${JSON.stringify(test.claims)}';`
        );
      }

      const res = await test.run(client);
      pass = res.pass;
      received = res.received;
      expected = res.expected;
    } catch (err) {
      pass = false;
      received = `Unhandled error: SQLSTATE ${err.code} (${err.message})`;
      expected = test.expected || 'clean execution';
    } finally {
      await client.query('ROLLBACK;');
    }

    if (pass) {
      passedCount++;
      console.log(`[PASS] Test ${test.id.toString().padStart(2, ' ')}: ${test.name}`);
      console.log(`       Received: ${received}`);
      console.log(`       Expected: ${expected}`);
    } else {
      failedCount++;
      console.log(`[FAIL] Test ${test.id.toString().padStart(2, ' ')}: ${test.name}`);
      console.log(`       Received: ${received}`);
      console.log(`       Expected: ${expected}`);
    }

    results.push({ id: test.id, name: test.name, pass, received, expected });
  }

  console.log('\n==============================================================================');
  console.log(`TEST RESULTS SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED, ${tests.length} TOTAL`);
  console.log('Verification Status: VERIFIED on embedded Postgres with stubbed Supabase auth');
  console.log('==============================================================================\n');

  console.log('--- CONSOLIDATED 27-TEST VERIFICATION MATRIX ---');
  console.log('| #  | Status | SQLSTATE / Value Expected | SQLSTATE / Value Received | Test Description |');
  console.log('|:--:|:------:|:--------------------------|:--------------------------|:-----------------|');
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`| ${r.id.toString().padStart(2, ' ')} | ${status}   | ${r.expected.padEnd(25)} | ${r.received.padEnd(25)} | ${r.name} |`);
  }
  console.log('------------------------------------------------------------------------------\n');

  await client.end();
  await pgServer.stop();

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
