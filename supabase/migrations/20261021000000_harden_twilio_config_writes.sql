-- ==============================================================================
-- Phase 2 / Module E: Harden client writes to twilio_configs
-- ==============================================================================
-- Phase 1 let owners/admins INSERT/UPDATE/DELETE any twilio_configs column from the browser.
-- Inbound calls and texts are routed by twilio_phone_number, so a tenant could claim a platform
-- number it never bought (and receive someone else's calls/texts), or delete a config while the
-- Twilio number keeps billing. Numbers are now provisioned and released only by server routes
-- (service_role) after purchasing through Twilio; clients may edit routing preferences only.

REVOKE INSERT, DELETE ON TABLE public.twilio_configs FROM authenticated;
REVOKE UPDATE ON TABLE public.twilio_configs FROM authenticated;
GRANT UPDATE (
    label,
    forward_to_number,
    forward_timeout_seconds,
    abandon_threshold_seconds,
    missed_call_sms_enabled,
    missed_call_sms_template,
    ai_voice_enabled,
    after_hours_direct_to_ai
) ON TABLE public.twilio_configs TO authenticated;

DROP POLICY IF EXISTS "Owners and Admins can insert Twilio config" ON public.twilio_configs;
DROP POLICY IF EXISTS "Owners and Admins can delete Twilio config" ON public.twilio_configs;

-- Toll-fraud guard: calls are only ever forwarded to North American (NANP) numbers, so a
-- compromised or malicious account cannot bridge calls to premium international destinations.
ALTER TABLE public.twilio_configs
    DROP CONSTRAINT IF EXISTS twilio_configs_forward_to_nanp;
ALTER TABLE public.twilio_configs
    ADD CONSTRAINT twilio_configs_forward_to_nanp CHECK (forward_to_number ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$');

-- Keep templates within two SMS segments and bounded ring timeouts.
ALTER TABLE public.twilio_configs
    DROP CONSTRAINT IF EXISTS twilio_configs_template_length;
ALTER TABLE public.twilio_configs
    ADD CONSTRAINT twilio_configs_template_length CHECK (char_length(missed_call_sms_template) BETWEEN 1 AND 300);
ALTER TABLE public.twilio_configs
    DROP CONSTRAINT IF EXISTS twilio_configs_forward_timeout_range;
ALTER TABLE public.twilio_configs
    ADD CONSTRAINT twilio_configs_forward_timeout_range CHECK (forward_timeout_seconds BETWEEN 5 AND 60);
