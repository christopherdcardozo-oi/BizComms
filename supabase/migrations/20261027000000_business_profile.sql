-- What the business tells its AI receptionist and review replier about itself: trade, services,
-- service area, urgent situations, intake questions, review sign-off. Shape is validated in the
-- app (src/lib/business-profile.ts); the database only keeps it a small JSON object.
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS business_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_business_profile_shape
    CHECK (jsonb_typeof(business_profile) = 'object' AND length(business_profile::text) <= 4000);

-- Owners/admins edit it like the other profile columns (RLS still limits rows to their org).
GRANT UPDATE (business_profile) ON TABLE public.organizations TO authenticated;
