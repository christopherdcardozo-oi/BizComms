-- ==============================================================================
-- Supabase Local Environment Stub (tests/bootstrap.sql)
--
-- NOTE: This file is a STUB of Supabase platform roles and auth schema for local
-- embedded PostgreSQL testing (non-Docker). It replicates the Supabase auth
-- infrastructure required by the multi-tenant migration and RLS policies:
--   1. Platform roles: anon, authenticated, service_role (NOLOGIN)
--   2. Schema auth with auth.users table
--   3. Functions auth.uid() and auth.role() reading 'request.jwt.claims'
--   4. Cryptographic extension: pgcrypto
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SUPABASE PLATFORM ROLES (NOLOGIN)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    ELSE
        ALTER ROLE service_role BYPASSRLS;
    END IF;
END $$;

-- Allow current connection user (postgres/superuser) to switch roles via SET LOCAL ROLE
GRANT anon, authenticated, service_role TO CURRENT_USER;

-- 3. SCHEMA GRANTS
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 4. AUTH SCHEMA & USERS TABLE
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, public;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID,
    aud VARCHAR(255),
    role VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    raw_user_meta_data JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Grant fixture management permissions on auth.users for test setup
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth.users TO anon, authenticated, service_role, CURRENT_USER;

-- 5. SUPABASE AUTH CONTEXT FUNCTIONS (STUBS)
-- Reads JWT claims injected via SET LOCAL "request.jwt.claims"
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
BEGIN
    RETURN (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon');
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'anon';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role, public;
