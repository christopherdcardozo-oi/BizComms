-- ==============================================================================
-- Phase 2 / Module D: Google review sync + AI reply engine
-- ==============================================================================

-- 1. google_configs: the connected Google account/location is set only by the OAuth callback
--    (service_role). Clients may tune reply behavior but can't point the org at another location.
REVOKE INSERT, DELETE ON TABLE public.google_configs FROM authenticated;
REVOKE UPDATE ON TABLE public.google_configs FROM authenticated;
GRANT UPDATE (
    auto_reply_enabled,
    auto_reply_min_stars,
    auto_publish_min_stars,
    reply_tone,
    custom_reply_instructions
) ON TABLE public.google_configs TO authenticated;
DROP POLICY IF EXISTS "Owners and Admins can insert Google config" ON public.google_configs;

ALTER TABLE public.google_configs DROP CONSTRAINT IF EXISTS google_configs_tone_length;
ALTER TABLE public.google_configs ADD CONSTRAINT google_configs_tone_length CHECK (char_length(reply_tone) BETWEEN 1 AND 200);
ALTER TABLE public.google_configs DROP CONSTRAINT IF EXISTS google_configs_instructions_length;
ALTER TABLE public.google_configs ADD CONSTRAINT google_configs_instructions_length
    CHECK (custom_reply_instructions IS NULL OR char_length(custom_reply_instructions) <= 1000);

-- 2. Claim a batch of reviews for AI reply generation (at-most-once across concurrent syncs).
--    Also reclaims reviews stuck in 'generating' (a crashed run) after 10 minutes.
CREATE OR REPLACE FUNCTION public.claim_reviews_for_reply(p_org_id UUID, p_limit INT DEFAULT 20)
RETURNS SETOF public.reviews AS $$
BEGIN
    RETURN QUERY
    UPDATE public.reviews r
    SET reply_status = 'generating', updated_at = timezone('utc'::text, now())
    WHERE r.id IN (
        SELECT id FROM public.reviews
        WHERE organization_id = p_org_id
          AND (reply_status = 'pending'
               OR (reply_status = 'generating' AND updated_at < timezone('utc'::text, now()) - interval '10 minutes'))
        ORDER BY review_created_at ASC
        LIMIT GREATEST(1, LEAST(p_limit, 100))
        FOR UPDATE SKIP LOCKED
    )
    RETURNING r.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.claim_reviews_for_reply(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reviews_for_reply(UUID, INT) TO service_role;
