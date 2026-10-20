-- ==============================================================================
-- B2B Local Business Communications OS - Corrected Multi-Tenant Schema (Rev 4)
-- Architecture Revision 4: Bulletproof Security Functions, Slug Validation,
-- Atomic Invite Acceptance, and Scoped Primary Line Swaps.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE call_status AS ENUM ('queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE call_outcome AS ENUM (
        'answered_by_business',
        'forwarded_to_ai',
        'missed_call_texted',
        'caller_abandoned',
        'caller_abandoned_before_ai',
        'ai_conversation_completed',
        'voicemail'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_direction AS ENUM ('inbound', 'outbound_api');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_status AS ENUM ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_type AS ENUM ('missed_call_auto_reply', 'manual_chat', 'system_alert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE review_reply_status AS ENUM ('pending', 'generating', 'manual_review', 'published', 'failed', 'skipped');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sentiment_type AS ENUM ('positive', 'neutral', 'negative');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE opt_out_source AS ENUM ('inbound_stop', 'manual_admin', 'api');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE a2p_status AS ENUM ('unregistered', 'pending', 'approved', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. ORGANIZATIONS (Tenants)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    business_phone TEXT CHECK (business_phone IS NULL OR business_phone ~ '^\+[1-9][0-9]{6,14}$'),
    business_address TEXT,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    business_hours JSONB DEFAULT '{
        "monday": {"open": "09:00", "close": "17:00", "closed": false},
        "tuesday": {"open": "09:00", "close": "17:00", "closed": false},
        "wednesday": {"open": "09:00", "close": "17:00", "closed": false},
        "thursday": {"open": "09:00", "close": "17:00", "closed": false},
        "friday": {"open": "09:00", "close": "17:00", "closed": false},
        "saturday": {"open": "10:00", "close": "14:00", "closed": false},
        "sunday": {"open": "00:00", "close": "00:00", "closed": true}
    }'::jsonb,
    ai_receptionist_prompt TEXT DEFAULT 'You are a warm, courteous, and efficient receptionist. Collect caller details and their inquiry.',
    vapi_assistant_id TEXT,
    vapi_phone_number_id TEXT,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    subscription_status TEXT DEFAULT 'trialing',
    monthly_voice_minutes_limit INT NOT NULL DEFAULT 150,
    monthly_sms_limit INT NOT NULL DEFAULT 500,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. USERS / PROFILES (Links Supabase auth.users to an organization)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    role user_role NOT NULL DEFAULT 'member',
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. ORGANIZATION INVITES
CREATE TABLE IF NOT EXISTS public.organization_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    token_hash TEXT NOT NULL UNIQUE,
    invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. TWILIO CONFIGURATIONS (Multi-location support with single primary per organization)
CREATE TABLE IF NOT EXISTS public.twilio_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Main Location',
    is_primary BOOLEAN NOT NULL DEFAULT false,
    twilio_phone_number TEXT NOT NULL UNIQUE CHECK (twilio_phone_number ~ '^\+[1-9][0-9]{6,14}$'),
    twilio_phone_sid TEXT,
    twilio_twiml_bin_sid TEXT,
    forward_to_number TEXT NOT NULL CHECK (forward_to_number ~ '^\+[1-9][0-9]{6,14}$'),
    forward_timeout_seconds INT NOT NULL DEFAULT 15,
    abandon_threshold_seconds INT NOT NULL DEFAULT 8 CHECK (abandon_threshold_seconds >= 1 AND abandon_threshold_seconds <= 60),
    missed_call_sms_enabled BOOLEAN NOT NULL DEFAULT true,
    missed_call_sms_template TEXT NOT NULL DEFAULT 'Hi, this is {{business_name}}! We missed your call. How can we help you today?',
    ai_voice_enabled BOOLEAN NOT NULL DEFAULT true,
    after_hours_direct_to_ai BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Partial Unique Index: Exactly one primary Twilio configuration per organization
CREATE UNIQUE INDEX IF NOT EXISTS uq_twilio_configs_primary_per_org
    ON public.twilio_configs (organization_id) WHERE (is_primary = true);

-- 7. GOOGLE BUSINESS PROFILE CONFIGURATION (Safe client-facing metadata)
CREATE TABLE IF NOT EXISTS public.google_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    google_account_id TEXT,
    google_location_id TEXT,
    location_name TEXT,
    auto_reply_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_reply_min_stars INT NOT NULL DEFAULT 1 CHECK (auto_reply_min_stars BETWEEN 1 AND 5),
    auto_publish_min_stars INT NOT NULL DEFAULT 4 CHECK (auto_publish_min_stars BETWEEN 1 AND 5),
    reply_tone TEXT NOT NULL DEFAULT 'warm, professional, empathetic, and appreciative',
    custom_reply_instructions TEXT DEFAULT 'Always offer a direct contact phone or email for negative feedback.',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. GOOGLE TOKENS (Isolated storage for OAuth credentials; Deny-all for authenticated clients)
CREATE TABLE IF NOT EXISTS public.google_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    encrypted_access_token TEXT,
    encrypted_refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- View for Dashboard consumption: security_invoker = true enforces RLS of invoking user
DROP VIEW IF EXISTS public.google_configs_safe;
CREATE VIEW public.google_configs_safe
WITH (security_invoker = true) AS
SELECT
    id,
    organization_id,
    google_account_id,
    google_location_id,
    location_name,
    auto_reply_enabled,
    auto_reply_min_stars,
    auto_publish_min_stars,
    reply_tone,
    custom_reply_instructions,
    last_synced_at,
    created_at,
    updated_at
FROM public.google_configs;

-- 9. CALL LOGS (With parent/child SID, outcome audit, and vapi_ended_reason)
CREATE TABLE IF NOT EXISTS public.call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    call_sid TEXT NOT NULL UNIQUE,
    parent_call_sid TEXT,
    child_call_sid TEXT,
    from_number TEXT NOT NULL CHECK (from_number ~ '^\+[1-9][0-9]{6,14}$'),
    to_number TEXT NOT NULL CHECK (to_number ~ '^\+[1-9][0-9]{6,14}$'),
    status call_status NOT NULL DEFAULT 'ringing',
    outcome call_outcome,
    vapi_ended_reason TEXT,
    duration_seconds INT DEFAULT 0,
    vapi_call_id TEXT,
    caller_name TEXT,
    recording_url TEXT,
    transcript TEXT,
    ai_summary TEXT,
    sms_rescued BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. MESSAGES (SMS & In-App Communications; Write strictly via server route)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
    message_sid TEXT UNIQUE,
    from_number TEXT NOT NULL CHECK (from_number ~ '^\+[1-9][0-9]{6,14}$'),
    to_number TEXT NOT NULL CHECK (to_number ~ '^\+[1-9][0-9]{6,14}$'),
    body TEXT NOT NULL,
    direction message_direction NOT NULL DEFAULT 'outbound_api',
    status message_status NOT NULL DEFAULT 'queued',
    type message_type NOT NULL DEFAULT 'missed_call_auto_reply',
    error_code TEXT,
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. SMS OPT-OUTS (TCPA / CTIA Compliance Registry)
CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{6,14}$'),
    opted_out_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    source opt_out_source NOT NULL DEFAULT 'inbound_stop',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, phone_number)
);

-- 12. A2P 10DLC REGISTRATIONS (Carrier compliance tracking)
CREATE TABLE IF NOT EXISTS public.a2p_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    brand_sid TEXT,
    campaign_sid TEXT,
    messaging_service_sid TEXT,
    status a2p_status NOT NULL DEFAULT 'unregistered',
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. REVIEWS (With approval workflow and AI model audit tracking)
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    google_review_id TEXT NOT NULL UNIQUE,
    reviewer_name TEXT NOT NULL DEFAULT 'Anonymous',
    reviewer_photo_url TEXT,
    star_rating INT NOT NULL CHECK (star_rating >= 1 AND star_rating <= 5),
    comment TEXT,
    review_created_at TIMESTAMPTZ NOT NULL,
    sentiment sentiment_type DEFAULT 'neutral',
    reply_text TEXT,
    reply_status review_reply_status NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    ai_model TEXT,
    ai_generated_at TIMESTAMPTZ,
    reply_published_at TIMESTAMPTZ,
    reply_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 14. USAGE RECORDS (Monthly Aggregations)
CREATE TABLE IF NOT EXISTS public.usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,
    ai_voice_seconds_used INT NOT NULL DEFAULT 0,
    sms_messages_sent INT NOT NULL DEFAULT 0,
    ai_review_replies_generated INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, billing_period_start)
);

-- 15. WEBHOOK IDEMPOTENCY LOG
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('twilio', 'vapi', 'stripe', 'google')),
    event_id TEXT NOT NULL,
    payload JSONB,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (provider, event_id)
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_org ON public.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_lookup ON public.organization_invites(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_call_logs_org_created ON public.call_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_parent_sid ON public.call_logs(parent_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_from ON public.call_logs(from_number);
CREATE INDEX IF NOT EXISTS idx_call_logs_org_sms_rescued ON public.call_logs(organization_id, sms_rescued);
CREATE INDEX IF NOT EXISTS idx_call_logs_org_outcome ON public.call_logs(organization_id, outcome);
CREATE INDEX IF NOT EXISTS idx_messages_org_created ON public.messages(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_call_log ON public.messages(call_log_id);
CREATE INDEX IF NOT EXISTS idx_messages_to ON public.messages(to_number);
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_lookup ON public.sms_opt_outs(organization_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_reviews_org_rating ON public.reviews(organization_id, star_rating);
CREATE INDEX IF NOT EXISTS idx_reviews_org_pending ON public.reviews(organization_id) WHERE (reply_status = 'pending');
CREATE INDEX IF NOT EXISTS idx_reviews_org_manual_review ON public.reviews(organization_id) WHERE (reply_status = 'manual_review');

-- ==============================================================================
-- FUNCTIONS & TRIGGERS
-- ==============================================================================

-- 1. Helper: Current User Org ID
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Helper: Current User Role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER tr_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER tr_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER tr_twilio_configs_updated_at BEFORE UPDATE ON public.twilio_configs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER tr_google_configs_updated_at BEFORE UPDATE ON public.google_configs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER tr_google_tokens_updated_at BEFORE UPDATE ON public.google_tokens FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER tr_a2p_registrations_updated_at BEFORE UPDATE ON public.a2p_registrations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER tr_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE OR REPLACE TRIGGER tr_usage_records_updated_at BEFORE UPDATE ON public.usage_records FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. Auth Signup Trigger (Defaults to member with NULL org; Never owner)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, role, organization_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        'member',
        NULL
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 5. Email Synchronization from auth.users to public.users
CREATE OR REPLACE FUNCTION public.handle_auth_user_email_sync()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        UPDATE public.users
        SET email = NEW.email, updated_at = timezone('utc'::text, now())
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_email_sync();

-- 6. Prevent User Privilege Escalation (SECURITY INVOKER; strict client block condition)
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- Block unprivileged client roles (authenticated and anon) from modifying security attributes
    IF current_user IN ('authenticated', 'anon') THEN
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'Privilege escalation denied: organization_id cannot be modified by user.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Privilege escalation denied: role cannot be modified by user.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Privilege escalation denied: email cannot be modified on public.users directly.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Non-client contexts (service_role, postgres, definer-owned RPCs) bypass
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

DROP TRIGGER IF EXISTS tr_prevent_user_privilege_escalation ON public.users;
CREATE TRIGGER tr_prevent_user_privilege_escalation
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.prevent_user_privilege_escalation();

-- Column-level grant protection
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON public.users TO authenticated;

-- 7. Ensure First Twilio Line is Primary
CREATE OR REPLACE FUNCTION public.handle_first_twilio_config_primary()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.twilio_configs WHERE organization_id = NEW.organization_id
    ) THEN
        NEW.is_primary := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_first_twilio_config_primary ON public.twilio_configs;
CREATE TRIGGER tr_first_twilio_config_primary
    BEFORE INSERT ON public.twilio_configs
    FOR EACH ROW EXECUTE FUNCTION public.handle_first_twilio_config_primary();

-- 8. Safe RPC: Set Primary Twilio Config (Verified owner/admin check, org-scoped atomic swap)
CREATE OR REPLACE FUNCTION public.set_primary_twilio_config(p_config_id UUID)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_user_org UUID;
    v_user_role user_role;
    v_config_org UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    SELECT organization_id, role INTO v_user_org, v_user_role
    FROM public.users
    WHERE id = v_user_id;

    IF v_user_org IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only owners and admins can set the primary phone configuration.'
            USING ERRCODE = '42501';
    END IF;

    SELECT organization_id INTO v_config_org
    FROM public.twilio_configs
    WHERE id = p_config_id;

    IF v_config_org IS NULL THEN
        RAISE EXCEPTION 'Twilio configuration not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_config_org <> v_user_org THEN
        RAISE EXCEPTION 'Access denied: target phone configuration belongs to another organization.'
            USING ERRCODE = '42501';
    END IF;

    -- Step 1: Clear current primary flag for this organization
    UPDATE public.twilio_configs
    SET is_primary = false
    WHERE organization_id = v_user_org
      AND is_primary = true;

    -- Step 2: Set target line as primary
    UPDATE public.twilio_configs
    SET is_primary = true
    WHERE id = p_config_id
      AND organization_id = v_user_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. RPC: Atomic Organization Creation & Owner Promotion (With slug & name validation)
CREATE OR REPLACE FUNCTION public.create_organization_for_user(p_name TEXT, p_slug TEXT)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_existing_org UUID;
    v_clean_name TEXT;
    v_clean_slug TEXT;
    v_new_org_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    SELECT organization_id INTO v_existing_org
    FROM public.users
    WHERE id = v_user_id;

    IF v_existing_org IS NOT NULL THEN
        RAISE EXCEPTION 'User already belongs to an organization.' USING ERRCODE = '23505';
    END IF;

    v_clean_name := TRIM(p_name);
    IF LENGTH(v_clean_name) < 2 OR LENGTH(v_clean_name) > 100 THEN
        RAISE EXCEPTION 'Organization name must be between 2 and 100 characters.'
            USING ERRCODE = '22023';
    END IF;

    v_clean_slug := LOWER(TRIM(p_slug));
    IF NOT (v_clean_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') OR LENGTH(v_clean_slug) < 2 OR LENGTH(v_clean_slug) > 50 THEN
        RAISE EXCEPTION 'Organization slug must be 2-50 characters, containing only lowercase letters, numbers, and hyphens (no leading, trailing, or consecutive hyphens).'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.organizations o WHERE o.slug = v_clean_slug) THEN
        RAISE EXCEPTION 'The organization slug "%" is already taken. Please choose another URL slug.', v_clean_slug
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.organizations (name, slug)
    VALUES (v_clean_name, v_clean_slug)
    RETURNING id INTO v_new_org_id;

    UPDATE public.users
    SET organization_id = v_new_org_id, role = 'owner'
    WHERE id = v_user_id;

    RETURN v_new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. RPC: Accept Team Invitation (Raw token input, SHA-256 SQL hashing, atomic mark)
CREATE OR REPLACE FUNCTION public.accept_organization_invite(p_raw_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_caller_email TEXT;
    v_existing_org UUID;
    v_token_hash TEXT;
    v_invite public.organization_invites;
    v_accepted_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_raw_token IS NULL OR TRIM(p_raw_token) = '' THEN
        RAISE EXCEPTION 'Invitation token cannot be empty.' USING ERRCODE = '22023';
    END IF;

    SELECT organization_id INTO v_existing_org
    FROM public.users
    WHERE id = v_user_id;

    IF v_existing_org IS NOT NULL THEN
        RAISE EXCEPTION 'User already belongs to an organization.' USING ERRCODE = '23505';
    END IF;

    SELECT email INTO v_caller_email
    FROM auth.users
    WHERE id = v_user_id;

    -- Hash raw token using SHA-256 via pgcrypto
    v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

    SELECT * INTO v_invite
    FROM public.organization_invites
    WHERE token_hash = v_token_hash
      AND expires_at > timezone('utc'::text, now())
      AND accepted_at IS NULL;

    IF v_invite.id IS NULL THEN
        RAISE EXCEPTION 'Invalid, expired, or already accepted invitation token.' USING ERRCODE = 'P0002';
    END IF;

    IF LOWER(TRIM(v_invite.email)) <> LOWER(TRIM(v_caller_email)) THEN
        RAISE EXCEPTION 'Invitation email mismatch: this invite was issued to a different email address.'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.organization_invites
    SET accepted_at = timezone('utc'::text, now())
    WHERE id = v_invite.id AND accepted_at IS NULL
    RETURNING id INTO v_accepted_id;

    IF v_accepted_id IS NULL THEN
        RAISE EXCEPTION 'Invitation has already been accepted by another session.' USING ERRCODE = '23505';
    END IF;

    UPDATE public.users
    SET organization_id = v_invite.organization_id,
        role = v_invite.role
    WHERE id = v_user_id;

    RETURN v_invite.organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 11. RPC: Atomic Usage Metering (Service Role Only)
CREATE OR REPLACE FUNCTION public.increment_usage(
    p_org_id UUID,
    p_period_start TIMESTAMPTZ,
    p_voice_seconds INT DEFAULT 0,
    p_sms_count INT DEFAULT 0,
    p_review_replies INT DEFAULT 0
)
RETURNS public.usage_records AS $$
DECLARE
    v_record public.usage_records;
    v_period_end TIMESTAMPTZ := p_period_start + interval '1 month';
BEGIN
    INSERT INTO public.usage_records (
        organization_id,
        billing_period_start,
        billing_period_end,
        ai_voice_seconds_used,
        sms_messages_sent,
        ai_review_replies_generated
    )
    VALUES (
        p_org_id,
        p_period_start,
        v_period_end,
        GREATEST(0, p_voice_seconds),
        GREATEST(0, p_sms_count),
        GREATEST(0, p_review_replies)
    )
    ON CONFLICT (organization_id, billing_period_start)
    DO UPDATE SET
        ai_voice_seconds_used = public.usage_records.ai_voice_seconds_used + EXCLUDED.ai_voice_seconds_used,
        sms_messages_sent = public.usage_records.sms_messages_sent + EXCLUDED.sms_messages_sent,
        ai_review_replies_generated = public.usage_records.ai_review_replies_generated + EXCLUDED.ai_review_replies_generated,
        updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_record;

    RETURN v_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 12. RPC: Get or Create Current Monthly Usage Period (Service Role Only)
CREATE OR REPLACE FUNCTION public.get_or_create_current_period(p_org_id UUID)
RETURNS public.usage_records AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_record public.usage_records;
BEGIN
    v_start := date_trunc('month', timezone('utc'::text, now()));
    v_end := v_start + interval '1 month';

    INSERT INTO public.usage_records (
        organization_id,
        billing_period_start,
        billing_period_end,
        ai_voice_seconds_used,
        sms_messages_sent,
        ai_review_replies_generated
    )
    VALUES (p_org_id, v_start, v_end, 0, 0, 0)
    ON CONFLICT (organization_id, billing_period_start)
    DO UPDATE SET updated_at = public.usage_records.updated_at
    RETURNING * INTO v_record;

    RETURN v_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. Function: Usage Soft Limit & Over-Limit Status (Service Role Only)
CREATE OR REPLACE FUNCTION public.org_usage_status(p_org_id UUID)
RETURNS TABLE (
    voice_minutes_used INT,
    voice_minutes_limit INT,
    sms_sent_count INT,
    sms_limit INT,
    over_voice_limit BOOLEAN,
    over_sms_limit BOOLEAN,
    over_any_limit BOOLEAN
) AS $$
DECLARE
    v_voice_secs INT := 0;
    v_sms INT := 0;
    v_voice_limit INT := 150;
    v_sms_limit INT := 500;
    v_start TIMESTAMPTZ;
BEGIN
    v_start := date_trunc('month', timezone('utc'::text, now()));

    SELECT monthly_voice_minutes_limit, monthly_sms_limit
    INTO v_voice_limit, v_sms_limit
    FROM public.organizations WHERE id = p_org_id;

    SELECT COALESCE(ai_voice_seconds_used, 0), COALESCE(sms_messages_sent, 0)
    INTO v_voice_secs, v_sms
    FROM public.usage_records
    WHERE organization_id = p_org_id AND billing_period_start = v_start;

    RETURN QUERY SELECT
        (v_voice_secs / 60)::INT AS voice_minutes_used,
        v_voice_limit AS voice_minutes_limit,
        v_sms AS sms_sent_count,
        v_sms_limit AS sms_limit,
        ((v_voice_secs / 60) >= v_voice_limit) AS over_voice_limit,
        (v_sms >= v_sms_limit) AS over_sms_limit,
        (((v_voice_secs / 60) >= v_voice_limit) OR (v_sms >= v_sms_limit)) AS over_any_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- FUNCTION EXECUTION PRIVILEGE AUDIT & REVOCATIONS
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.current_user_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_organization_for_user(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_for_user(TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.accept_organization_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invite(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_primary_twilio_config(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_primary_twilio_config(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.increment_usage(UUID, TIMESTAMPTZ, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(UUID, TIMESTAMPTZ, INT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_or_create_current_period(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_current_period(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.org_usage_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_usage_status(UUID) TO service_role;

-- ==============================================================================
-- TABLE & COLUMN PRIVILEGE AUDIT & REVOCATIONS
-- ==============================================================================

-- Revoke all table-level privileges on sensitive token and webhook tables from client roles
REVOKE ALL ON TABLE public.google_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated;

-- Revoke all table-level privileges on all tenant tables from anon
REVOKE ALL ON TABLE public.organizations, public.users, public.organization_invites,
    public.twilio_configs, public.google_configs, public.call_logs,
    public.messages, public.sms_opt_outs, public.a2p_registrations,
    public.reviews, public.usage_records FROM anon;

-- Revoke all table-level privileges on read-only tables from authenticated
REVOKE ALL ON TABLE public.call_logs, public.messages, public.usage_records,
    public.a2p_registrations, public.sms_opt_outs FROM authenticated;

-- Read-only tables for authenticated clients (no client write policies exist)
GRANT SELECT ON TABLE public.call_logs, public.messages, public.usage_records,
    public.a2p_registrations, public.sms_opt_outs TO authenticated;

-- Safe views for authenticated clients
GRANT SELECT ON public.google_configs_safe TO authenticated;

-- Tenant configuration and management tables with client write policies
GRANT SELECT, UPDATE ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.organization_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.twilio_configs, public.google_configs TO authenticated;

-- Users table: SELECT + restricted self-service column-level UPDATE
GRANT SELECT ON TABLE public.users TO authenticated;
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON public.users TO authenticated;

-- Reviews table: SELECT + restricted column-level UPDATE on draft reply_text only
GRANT SELECT ON TABLE public.reviews TO authenticated;
REVOKE UPDATE ON public.reviews FROM authenticated;
GRANT UPDATE (reply_text) ON public.reviews TO authenticated;

-- Grant ALL on all public tables to service_role
GRANT ALL ON TABLE public.organizations, public.users, public.organization_invites,
    public.twilio_configs, public.google_configs, public.google_tokens,
    public.call_logs, public.messages, public.sms_opt_outs, public.a2p_registrations,
    public.reviews, public.usage_records, public.webhook_events TO service_role;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twilio_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2p_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- 1. ORGANIZATIONS
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
CREATE POLICY "Users can view their own organization"
    ON public.organizations FOR SELECT
    USING (id = public.current_user_org_id());

DROP POLICY IF EXISTS "Owners and Admins can update their organization" ON public.organizations;
CREATE POLICY "Owners and Admins can update their organization"
    ON public.organizations FOR UPDATE
    USING (id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'))
    WITH CHECK (id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

-- 2. USERS
DROP POLICY IF EXISTS "Users can view members in their organization" ON public.users;
CREATE POLICY "Users can view members in their organization"
    ON public.users FOR SELECT
    USING (organization_id = public.current_user_org_id() OR id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 3. ORGANIZATION INVITES
DROP POLICY IF EXISTS "Owners and Admins can view invites" ON public.organization_invites;
CREATE POLICY "Owners and Admins can view invites"
    ON public.organization_invites FOR SELECT
    USING (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and Admins can create invites" ON public.organization_invites;
CREATE POLICY "Owners and Admins can create invites"
    ON public.organization_invites FOR INSERT
    WITH CHECK (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and Admins can delete invites" ON public.organization_invites;
CREATE POLICY "Owners and Admins can delete invites"
    ON public.organization_invites FOR DELETE
    USING (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

-- 4. TWILIO CONFIGS (Multi-location)
DROP POLICY IF EXISTS "Users can view their Twilio config" ON public.twilio_configs;
CREATE POLICY "Users can view their Twilio config"
    ON public.twilio_configs FOR SELECT
    USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Owners and Admins can insert Twilio config" ON public.twilio_configs;
CREATE POLICY "Owners and Admins can insert Twilio config"
    ON public.twilio_configs FOR INSERT
    WITH CHECK (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and Admins can update Twilio config" ON public.twilio_configs;
CREATE POLICY "Owners and Admins can update Twilio config"
    ON public.twilio_configs FOR UPDATE
    USING (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'))
    WITH CHECK (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and Admins can delete Twilio config" ON public.twilio_configs;
CREATE POLICY "Owners and Admins can delete Twilio config"
    ON public.twilio_configs FOR DELETE
    USING (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

-- 5. GOOGLE CONFIGS
DROP POLICY IF EXISTS "Users can view their Google config" ON public.google_configs;
CREATE POLICY "Users can view their Google config"
    ON public.google_configs FOR SELECT
    USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Owners and Admins can insert Google config" ON public.google_configs;
CREATE POLICY "Owners and Admins can insert Google config"
    ON public.google_configs FOR INSERT
    WITH CHECK (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and Admins can update Google config" ON public.google_configs;
CREATE POLICY "Owners and Admins can update Google config"
    ON public.google_configs FOR UPDATE
    USING (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'))
    WITH CHECK (organization_id = public.current_user_org_id() AND public.current_user_role() IN ('owner', 'admin'));

-- 6. GOOGLE TOKENS (DENY ALL for authenticated users - Service Role Only)
-- No policies defined; strictly service-role accessible.

-- 7. CALL LOGS
DROP POLICY IF EXISTS "Users can view their organization call logs" ON public.call_logs;
CREATE POLICY "Users can view their organization call logs"
    ON public.call_logs FOR SELECT
    USING (organization_id = public.current_user_org_id());

-- 8. MESSAGES (Outbound strictly via server route; client INSERT policy removed)
DROP POLICY IF EXISTS "Users can view their organization messages" ON public.messages;
CREATE POLICY "Users can view their organization messages"
    ON public.messages FOR SELECT
    USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Users can insert messages to their organization" ON public.messages;

-- 9. SMS OPT-OUTS
DROP POLICY IF EXISTS "Users can view their organization opt outs" ON public.sms_opt_outs;
CREATE POLICY "Users can view their organization opt outs"
    ON public.sms_opt_outs FOR SELECT
    USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Owners and Admins can insert opt outs" ON public.sms_opt_outs;
DROP POLICY IF EXISTS "Owners and Admins can delete opt outs" ON public.sms_opt_outs;
-- SMS opt-outs are recorded strictly via incoming STOP webhook / server backend via service_role. Client write policies removed.

-- 10. A2P REGISTRATIONS
DROP POLICY IF EXISTS "Users can view their A2P registration" ON public.a2p_registrations;
CREATE POLICY "Users can view their A2P registration"
    ON public.a2p_registrations FOR SELECT
    USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Owners and Admins can manage A2P registration" ON public.a2p_registrations;
-- A2P registrations are submitted and verified strictly via server backend / service_role. Client write policy removed.

-- 11. REVIEWS (Role-aware update policy: Members cannot approve or publish)
DROP POLICY IF EXISTS "Users can view their organization reviews" ON public.reviews;
CREATE POLICY "Users can view their organization reviews"
    ON public.reviews FOR SELECT
    USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Users can update review replies in their organization" ON public.reviews;
DROP POLICY IF EXISTS "Members can update draft replies" ON public.reviews;
CREATE POLICY "Members can update draft replies"
    ON public.reviews FOR UPDATE
    USING (
        organization_id = public.current_user_org_id()
        AND public.current_user_role() = 'member'
        AND reply_status IN ('pending', 'manual_review')
    )
    WITH CHECK (
        organization_id = public.current_user_org_id()
        AND reply_status IN ('pending', 'manual_review')
    );

DROP POLICY IF EXISTS "Owners and Admins can manage review replies" ON public.reviews;
DROP POLICY IF EXISTS "Owners and Admins can update replies" ON public.reviews;
CREATE POLICY "Owners and Admins can update replies"
    ON public.reviews FOR UPDATE
    USING (
        organization_id = public.current_user_org_id()
        AND public.current_user_role() IN ('owner', 'admin')
    )
    WITH CHECK (
        organization_id = public.current_user_org_id()
        AND public.current_user_role() IN ('owner', 'admin')
    );

-- 12. USAGE RECORDS (Read-only for all tenant users; mutations via RPC or Service Role)
DROP POLICY IF EXISTS "Users can view their usage records" ON public.usage_records;
CREATE POLICY "Users can view their usage records"
    ON public.usage_records FOR SELECT
    USING (organization_id = public.current_user_org_id());

-- 13. WEBHOOK EVENTS (DENY ALL for authenticated users - Service Role Only)
-- No policies defined; strictly service-role accessible.
