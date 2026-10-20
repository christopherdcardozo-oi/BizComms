-- ==============================================================================
-- Billing: track when subscription_status last changed (drives number release grace period)
-- ==============================================================================
-- /api/cron/release-lapsed-numbers releases Twilio numbers of organizations that have been
-- canceled/unpaid for longer than a grace period. That needs to know *when* the status
-- changed, and the timestamp must be trustworthy: it is maintained only by this trigger,
-- so neither a client nor a buggy server write can backdate it into an early release.

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS subscription_status_changed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.track_subscription_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
        NEW.subscription_status_changed_at := timezone('utc'::text, now());
    ELSE
        NEW.subscription_status_changed_at := OLD.subscription_status_changed_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_organizations_subscription_status_changed ON public.organizations;
CREATE TRIGGER tr_organizations_subscription_status_changed
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.track_subscription_status_change();

-- Lapsed-number lookups: few rows match, so a partial index keeps the cron query cheap.
CREATE INDEX IF NOT EXISTS idx_organizations_lapsed_subscription
    ON public.organizations (subscription_status_changed_at)
    WHERE subscription_status IN ('canceled', 'unpaid', 'incomplete_expired', 'paused');
