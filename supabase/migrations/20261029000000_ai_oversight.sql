-- AI oversight: record why a missed caller was or wasn't texted back, so the owner can see every
-- decision the system made on a call ("not texted: caller opted out"). Written by the server only.
ALTER TABLE public.call_logs
    ADD COLUMN IF NOT EXISTS sms_rescue_result TEXT
    CHECK (sms_rescue_result IS NULL OR sms_rescue_result IN
        ('sent', 'failed', 'disabled', 'billing_inactive', 'invalid_caller', 'opted_out', 'a2p_not_approved', 'over_quota'));
