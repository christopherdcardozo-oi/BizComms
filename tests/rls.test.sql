-- ==============================================================================
-- pgTAP Database & RLS Test Suite for Local Business Communications OS (Rev 5)
-- Execution:
--   supabase test db
--   OR
--   pg_prove -U postgres -d <database_url> tests/rls.test.sql
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(27);

-- ------------------------------------------------------------------------------
-- 0. FIXTURES (Insert into auth.users first, then scaffold public tables)
-- ------------------------------------------------------------------------------

SET search_path = public, auth, extensions;

-- Create test identities in auth.users
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES 
    ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@acme.com', '{"full_name":"Alice Owner"}'::jsonb, now(), now()),
    ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@acme.com', '{"full_name":"Bob Tech"}'::jsonb, now(), now()),
    ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'charlie@beacon.com', '{"full_name":"Charlie Owner"}'::jsonb, now(), now()),
    ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dan@fresh.com', '{"full_name":"Dan Fresh"}'::jsonb, now(), now()),
    ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eve@intruder.com', '{"full_name":"Eve Intruder"}'::jsonb, now(), now()),
    ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frank@unassigned.com', '{"full_name":"Frank Unassigned"}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Create Organizations
INSERT INTO public.organizations (id, name, slug)
VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Plumbing', 'acme-plumbing'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Beacon Dental', 'beacon-dental')
ON CONFLICT (id) DO NOTHING;

-- Link Users in public.users (Runs as postgres - bypasses prevent_user_privilege_escalation cleanly)
UPDATE public.users SET organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'owner' WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.users SET organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'member' WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE public.users SET organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role = 'owner' WHERE id = '33333333-3333-3333-3333-333333333333';
-- Dan ('4444...'), Eve ('5555...'), Frank ('6666...') are unassigned fresh users (org = NULL, role = member)

-- Create Twilio Config fixtures
INSERT INTO public.twilio_configs (id, organization_id, label, is_primary, twilio_phone_number, forward_to_number)
VALUES 
    ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Main Line', true, '+12025550101', '+12025550199'),
    ('a1111111-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Dispatch Line', false, '+12025550102', '+12025550199'),
    ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Main Line', true, '+12025550202', '+12025550299')
ON CONFLICT DO NOTHING;

-- Create Google Config & Token fixtures
INSERT INTO public.google_configs (id, organization_id, google_location_id, location_name)
VALUES 
    ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'locations/loc-a', 'Acme Plumbing Google Maps'),
    ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'locations/loc-b', 'Beacon Dental Google Maps')
ON CONFLICT DO NOTHING;

INSERT INTO public.google_tokens (organization_id, encrypted_refresh_token)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'enc_secret_token_org_a')
ON CONFLICT DO NOTHING;

-- Create Review fixture for Org A
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

-- Create an invite fixture for Dan (Valid hex UUID, SHA-256 hash stored in DB)
INSERT INTO public.organization_invites (id, organization_id, email, role, token_hash, expires_at)
VALUES (
    'e1111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'dan@fresh.com',
    'member',
    encode(digest('dan_secret_invite_token_2026', 'sha256'), 'hex'),
    now() + interval '7 days'
) ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- TEST 1: User A cannot read User B's Twilio Config
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT is_empty(
    $$ SELECT * FROM public.twilio_configs WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
    'Test 1: User A cannot read Org B twilio_configs'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 2: User A cannot move a row to Org B (Anti-tenant hopping WITH CHECK)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ UPDATE public.twilio_configs SET organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
    '42501',
    NULL,
    'Test 2: Anti-tenant hopping blocked by WITH CHECK policy (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 3: Member cannot modify twilio_configs (USING clause silently updates 0 rows)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

UPDATE public.twilio_configs SET forward_to_number = '+12025559999' WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(
    (SELECT count(*)::int FROM public.twilio_configs WHERE forward_to_number = '+12025559999'),
    0,
    'Test 3: Member UPDATE affects 0 rows and target configuration data is unchanged'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 4: Token Isolation: Authenticated users cannot access google_tokens
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ SELECT * FROM public.google_tokens $$,
    '42501',
    NULL,
    'Test 4: google_tokens table is strictly inaccessible to authenticated clients (REVOKE ALL)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 5: google_configs_safe with security_invoker = true enforces tenant isolation
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT is_empty(
    $$ SELECT * FROM public.google_configs_safe WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
    'Test 5: google_configs_safe view prevents cross-tenant data leakage'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 6: Member CANNOT modify star_rating on reviews (Column Privilege Denied)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT throws_ok(
    $$ UPDATE public.reviews SET star_rating = 5 WHERE id = 'a3333333-3333-3333-3333-333333333333' $$,
    '42501',
    NULL,
    'Test 6: Member cannot modify review star_rating (column update revoked)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 7: Member CANNOT modify reply_status on reviews (Column Privilege Denied)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT throws_ok(
    $$ UPDATE public.reviews SET reply_status = 'published' WHERE id = 'a3333333-3333-3333-3333-333333333333' $$,
    '42501',
    NULL,
    'Test 7: Member cannot publish review by changing reply_status (column update revoked)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 8: Member CANNOT modify approved_by on reviews (Column Privilege Denied)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT throws_ok(
    $$ UPDATE public.reviews SET approved_by = '22222222-2222-2222-2222-222222222222' WHERE id = 'a3333333-3333-3333-3333-333333333333' $$,
    '42501',
    NULL,
    'Test 8: Member cannot approve review by setting approved_by (column update revoked)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 9: Member CAN update reply_text on draft review
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

UPDATE public.reviews SET reply_text = 'Updated draft response by technician.' WHERE id = 'a3333333-3333-3333-3333-333333333333';

SELECT is(
    (SELECT reply_text FROM public.reviews WHERE id = 'a3333333-3333-3333-3333-333333333333'),
    'Updated draft response by technician.',
    'Test 9: Member can successfully update reply_text column on draft review'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 10: Authenticated client CANNOT call increment_usage (Permission Denied)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ SELECT public.increment_usage('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 60, 1, 0) $$,
    '42501',
    NULL,
    'Test 10: Authenticated user cannot call increment_usage (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 11: Authenticated client CANNOT insert into messages table directly
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ INSERT INTO public.messages (organization_id, from_number, to_number, body) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+12025550101', '+12025559999', 'Spam test') $$,
    '42501',
    NULL,
    'Test 11: Authenticated client cannot insert into messages table directly (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 12: Member cannot self-promote to owner on users table
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT throws_ok(
    $$ UPDATE public.users SET role = 'owner' WHERE id = '22222222-2222-2222-2222-222222222222' $$,
    '42501',
    NULL,
    'Test 12: Direct role update blocked by privilege escalation trigger (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 13: Owner cannot directly modify role on users table
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ UPDATE public.users SET role = 'member' WHERE id = '11111111-1111-1111-1111-111111111111' $$,
    '42501',
    NULL,
    'Test 13: Owner direct role update blocked by privilege escalation trigger (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 14: accept_organization_invite fails with mismatched caller email
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
-- Eve ('5555...') tries to redeem Dan's raw invite token
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

SELECT throws_ok(
    $$ SELECT public.accept_organization_invite('dan_secret_invite_token_2026') $$,
    '42501',
    NULL,
    'Test 14: accept_organization_invite fails on email mismatch (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 15: set_primary_twilio_config fails for member
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT throws_ok(
    $$ SELECT public.set_primary_twilio_config('a1111111-2222-2222-2222-222222222222') $$,
    '42501',
    NULL,
    'Test 15: set_primary_twilio_config fails for member (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 16: set_primary_twilio_config fails for foreign org admin
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
-- Charlie (Owner of Org B) tries to set primary line in Org A
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

SELECT throws_ok(
    $$ SELECT public.set_primary_twilio_config('a1111111-2222-2222-2222-222222222222') $$,
    '42501',
    NULL,
    'Test 16: set_primary_twilio_config fails for foreign org admin (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 17: set_primary_twilio_config swaps primary line twice without index collision
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
-- Alice (Owner of Org A) swaps primary line to Line 2, then back to Line 1
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT lives_ok(
    $$ 
    SELECT public.set_primary_twilio_config('a1111111-2222-2222-2222-222222222222');
    SELECT public.set_primary_twilio_config('a1111111-1111-1111-1111-111111111111');
    $$,
    'Test 17: Consecutive primary line swaps succeed without partial unique index violation'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 18: create_organization_for_user validates slug regex
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

SELECT throws_ok(
    $$ SELECT public.create_organization_for_user('Eve Org', 'INVALID_SLUG!') $$,
    '22023',
    NULL,
    'Test 18: Invalid slug format throws 22023'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 19: create_organization_for_user rejects duplicate slug
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

SELECT throws_ok(
    $$ SELECT public.create_organization_for_user('Acme Clone', 'acme-plumbing') $$,
    '23505',
    NULL,
    'Test 19: Duplicate slug throws 23505'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 20: Valid create_organization_for_user promotes fresh user to owner
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

SELECT lives_ok(
    $$ SELECT public.create_organization_for_user('Eve Innovations', 'eve-innovations') $$,
    'Test 20: Fresh user successfully creates organization and is promoted to owner'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 21: Authorized recipient accepts invite with RAW token atomically
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

SELECT lives_ok(
    $$ SELECT public.accept_organization_invite('dan_secret_invite_token_2026') $$,
    'Test 21: Authorized recipient can accept organization invite via raw token'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 22: Anon role cannot select tenant tables (REVOKE ALL enforced)
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

SELECT throws_ok(
    $$ SELECT * FROM public.organizations $$,
    '42501',
    NULL,
    'Test 22: Anon role denied SELECT on tenant organizations table (SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 23: Non-member user (org = NULL) sees 0 rows in tenant tables
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
-- Frank ('6666...') is authenticated but has organization_id IS NULL
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

SELECT is_empty(
    $$ SELECT * FROM public.twilio_configs $$,
    'Test 23: Non-member user without organization membership sees 0 rows across tenant tables'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 24: Authenticated client CANNOT insert into call_logs directly
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ INSERT INTO public.call_logs (organization_id, call_sid, from_number, to_number) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CA_test_rev7_24', '+12025550101', '+12025550199') $$,
    '42501',
    NULL,
    'Test 24: Authenticated client cannot insert into call_logs (least privilege enforced, SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 25: Authenticated client CANNOT insert into usage_records directly
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ INSERT INTO public.usage_records (organization_id, billing_period_start, billing_period_end) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now() + interval '30 days') $$,
    '42501',
    NULL,
    'Test 25: Authenticated client cannot insert into usage_records (least privilege enforced, SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 26: Authenticated client CANNOT insert into a2p_registrations directly
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ INSERT INTO public.a2p_registrations (organization_id, brand_sid) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BN_test_rev7_26') $$,
    '42501',
    NULL,
    'Test 26: Authenticated client cannot insert into a2p_registrations (least privilege enforced, SQLSTATE 42501)'
);
RESET ROLE;

-- ------------------------------------------------------------------------------
-- TEST 27: Authenticated client CANNOT insert into sms_opt_outs directly
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT throws_ok(
    $$ INSERT INTO public.sms_opt_outs (organization_id, phone_number) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+12025550999') $$,
    '42501',
    NULL,
    'Test 27: Authenticated client cannot insert into sms_opt_outs (least privilege enforced, SQLSTATE 42501)'
);
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
