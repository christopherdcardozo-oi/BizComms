-- ==============================================================================
-- Phase 2 / Module A: Telephony webhook RPCs (additive; Phase 1 schema untouched)
-- ==============================================================================

-- 1. RPC: Out-of-order-safe call log upsert (DESIGN_NOTES §1, "Out-of-Order Webhook Protection")
-- Twilio action/status callbacks and Vapi reports can arrive in any order. Terminal statuses are
-- never regressed, durations only grow, and nullable fields are only filled, never cleared.
-- The conflict update is scoped to the same organization so a forged or misrouted call_sid
-- can never re-parent another tenant's call record.
CREATE OR REPLACE FUNCTION public.upsert_call_log(
    p_call_sid TEXT,
    p_org_id UUID,
    p_from_number TEXT,
    p_to_number TEXT,
    p_status call_status DEFAULT NULL,
    p_outcome call_outcome DEFAULT NULL,
    p_parent_call_sid TEXT DEFAULT NULL,
    p_child_call_sid TEXT DEFAULT NULL,
    p_duration_seconds INT DEFAULT NULL,
    p_ended_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.call_logs AS $$
DECLARE
    v_record public.call_logs;
BEGIN
    INSERT INTO public.call_logs (
        call_sid, organization_id, from_number, to_number, status, outcome,
        parent_call_sid, child_call_sid, duration_seconds, ended_at
    )
    VALUES (
        p_call_sid, p_org_id, p_from_number, p_to_number, COALESCE(p_status, 'ringing'), p_outcome,
        p_parent_call_sid, p_child_call_sid, GREATEST(COALESCE(p_duration_seconds, 0), 0), p_ended_at
    )
    ON CONFLICT (call_sid) DO UPDATE SET
        status = CASE
            WHEN public.call_logs.status IN ('completed', 'failed', 'busy', 'no-answer', 'canceled')
                THEN public.call_logs.status
            WHEN p_status IS NULL THEN public.call_logs.status
            ELSE EXCLUDED.status
        END,
        outcome = COALESCE(p_outcome, public.call_logs.outcome),
        parent_call_sid = COALESCE(EXCLUDED.parent_call_sid, public.call_logs.parent_call_sid),
        child_call_sid = COALESCE(EXCLUDED.child_call_sid, public.call_logs.child_call_sid),
        duration_seconds = GREATEST(public.call_logs.duration_seconds, EXCLUDED.duration_seconds),
        ended_at = COALESCE(public.call_logs.ended_at, EXCLUDED.ended_at)
    WHERE public.call_logs.organization_id = EXCLUDED.organization_id
    RETURNING * INTO v_record;

    RETURN v_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. RPC: At-most-once rescue SMS claim
-- Both the Twilio action route (Case A) and the Vapi webhook (Case B) may decide to text the
-- caller. Whoever flips sms_rescued first wins; every other caller gets FALSE and must not send.
CREATE OR REPLACE FUNCTION public.claim_sms_rescue(p_call_sid TEXT, p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_claimed INT;
BEGIN
    UPDATE public.call_logs
    SET sms_rescued = true
    WHERE call_sid = p_call_sid
      AND organization_id = p_org_id
      AND sms_rescued = false;
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    RETURN v_claimed = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.upsert_call_log(TEXT, UUID, TEXT, TEXT, call_status, call_outcome, TEXT, TEXT, INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_call_log(TEXT, UUID, TEXT, TEXT, call_status, call_outcome, TEXT, TEXT, INT, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_sms_rescue(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sms_rescue(TEXT, UUID) TO service_role;
