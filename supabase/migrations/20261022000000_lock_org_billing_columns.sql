-- ==============================================================================
-- Phase 2 / Billing: server-only billing, quota and integration columns on organizations
-- ==============================================================================
-- Phase 1 granted owners/admins UPDATE on every organizations column. That let a customer
-- mark their own subscription active, attach any Stripe IDs, or raise their own SMS/voice
-- quotas from the browser. Billing state is now written only by the Stripe webhook
-- (service_role); clients may edit their business profile only.

REVOKE UPDATE ON TABLE public.organizations FROM authenticated;
GRANT UPDATE (
    name,
    business_phone,
    business_address,
    timezone,
    business_hours,
    ai_receptionist_prompt
) ON TABLE public.organizations TO authenticated;

-- 'trialing' as a default made every brand-new, never-paid organization look subscribed.
-- 'none' = no Stripe subscription yet; the webhook sets real Stripe statuses from here on.
ALTER TABLE public.organizations ALTER COLUMN subscription_status SET DEFAULT 'none';
UPDATE public.organizations
SET subscription_status = 'none'
WHERE stripe_subscription_id IS NULL AND subscription_status = 'trialing';
