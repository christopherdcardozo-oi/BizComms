-- ==============================================================================
-- Phase 2 / Module B: apply a Vapi end-of-call report to the Twilio call it belongs to
-- ==============================================================================
-- Update-only (Module A always creates the call_logs row before the AI leg starts), scoped to
-- the organization, and first-writer-wins on vapi_call_id: once a call log is bound to one Vapi
-- call, a different Vapi call can never overwrite its outcome or transcript. Re-delivery of
-- the same report is a harmless no-op merge.
CREATE OR REPLACE FUNCTION public.apply_ai_call_report(
    p_call_sid TEXT,
    p_org_id UUID,
    p_vapi_call_id TEXT,
    p_ended_reason TEXT,
    p_outcome call_outcome,
    p_duration_seconds INT,
    p_transcript TEXT,
    p_summary TEXT,
    p_recording_url TEXT
)
RETURNS public.call_logs AS $$
DECLARE
    v_record public.call_logs;
BEGIN
    UPDATE public.call_logs
    SET vapi_call_id = p_vapi_call_id,
        vapi_ended_reason = COALESCE(p_ended_reason, vapi_ended_reason),
        outcome = COALESCE(p_outcome, outcome),
        duration_seconds = GREATEST(duration_seconds, COALESCE(p_duration_seconds, 0)),
        transcript = COALESCE(p_transcript, transcript),
        ai_summary = COALESCE(p_summary, ai_summary),
        recording_url = COALESCE(p_recording_url, recording_url)
    WHERE call_sid = p_call_sid
      AND organization_id = p_org_id
      AND (vapi_call_id IS NULL OR vapi_call_id = p_vapi_call_id)
    RETURNING * INTO v_record;

    RETURN v_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.apply_ai_call_report(TEXT, UUID, TEXT, TEXT, call_outcome, INT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ai_call_report(TEXT, UUID, TEXT, TEXT, call_outcome, INT, TEXT, TEXT, TEXT) TO service_role;

-- Correlation fallback: "this caller's most recent AI handoff" when SIP headers don't come through.
CREATE INDEX IF NOT EXISTS idx_call_logs_ai_handoff_lookup
    ON public.call_logs (from_number, created_at DESC)
    WHERE outcome = 'forwarded_to_ai' AND vapi_call_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_vapi_phone_number_id
    ON public.organizations (vapi_phone_number_id)
    WHERE vapi_phone_number_id IS NOT NULL;
