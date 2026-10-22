-- Owner texting command center: the business owner gets lead alerts by text on their own phone
-- and runs the business by replying ("1" to call back, "won 650", ...). See src/lib/owner/.

-- Per line: owners can turn alerts off. Alerts go to the line's forward_to_number.
ALTER TABLE public.twilio_configs
    ADD COLUMN IF NOT EXISTS owner_alerts_enabled BOOLEAN NOT NULL DEFAULT true;
GRANT UPDATE (owner_alerts_enabled) ON TABLE public.twilio_configs TO authenticated;

-- Every alert sent to the owner. dedupe_key makes each alert at-most-once even when Twilio or
-- Vapi redeliver a callback (e.g. 'call:<CallSid>', 'ai:<CallSid>', 'digest:2026-10-22').
-- The latest lead alert is what owner replies ("1", "won 650") act on.
CREATE TABLE IF NOT EXISTS public.owner_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('missed_call', 'ai_call', 'text', 'digest')),
    dedupe_key TEXT NOT NULL,
    contact_number TEXT CHECK (contact_number ~ '^\+[1-9][0-9]{6,14}$'),
    call_sid TEXT,
    urgent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (organization_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_owner_alerts_org_created ON public.owner_alerts(organization_id, created_at DESC);

-- Jobs the owner marked as won (by text today; from the dashboard later). Powers "money recovered".
CREATE TABLE IF NOT EXISTS public.jobs_won (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_number TEXT CHECK (contact_number ~ '^\+[1-9][0-9]{6,14}$'),
    call_sid TEXT,
    amount_cents INT CHECK (amount_cents >= 0 AND amount_cents <= 100000000),
    source TEXT NOT NULL DEFAULT 'owner_text' CHECK (source IN ('owner_text', 'dashboard')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_jobs_won_org_created ON public.jobs_won(organization_id, created_at DESC);

-- Members can read their own organization's rows; all writes go through the server (service role).
ALTER TABLE public.owner_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_won ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.owner_alerts, public.jobs_won FROM anon, authenticated;
GRANT SELECT ON TABLE public.owner_alerts, public.jobs_won TO authenticated;
GRANT ALL ON TABLE public.owner_alerts, public.jobs_won TO service_role;

DROP POLICY IF EXISTS "Users can view their organization owner alerts" ON public.owner_alerts;
CREATE POLICY "Users can view their organization owner alerts"
    ON public.owner_alerts FOR SELECT
    USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Users can view their organization jobs won" ON public.jobs_won;
CREATE POLICY "Users can view their organization jobs won"
    ON public.jobs_won FOR SELECT
    USING (organization_id = public.current_user_org_id());
