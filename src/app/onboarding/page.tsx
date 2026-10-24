import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canManage, requireUser } from '@/lib/auth/session';
import { canProvisionNumber } from '@/lib/billing/status';
import { serverEnv } from '@/lib/config/env';
import { NumberStep } from './number-step';
import { OrgForm } from './org-form';
import { PlanStep } from './plan-step';
import { pricing } from '@/lib/site';
import { siteConfig } from '@/lib/site';

export const metadata = { title: `Get started · ${siteConfig.name}` };

const STEPS = {
  business: { n: 1, title: 'Tell us about your business', description: 'You can change these later.' },
  plan: { n: 2, title: 'Start your subscription', description: 'Your business number is included.' },
  number: {
    n: 3,
    title: 'Get your business number',
    description: 'Customers call this number. We ring your phone, and text back anyone you miss.',
  },
} as const;

const CHECKOUT_NOTICES: Record<string, string> = {
  canceled: 'Checkout was canceled. You can start it again whenever you are ready.',
  pending: 'We are confirming your payment with Stripe. Refresh in a moment.',
};

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await requireUser();
  const { checkout } = await searchParams;

  let step: keyof typeof STEPS = 'business';
  if (session.organizationId) {
    const { count } = await session.supabase
      .from('twilio_configs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId);
    if ((count ?? 0) > 0 || !canManage(session.role)) redirect('/dashboard');
    step = canProvisionNumber(session.subscriptionStatus) ? 'number' : 'plan';
  }
  const current = STEPS[step];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-xl font-semibold tracking-tight">{siteConfig.name}</p>
      <p className="text-sm text-muted-foreground">Step {current.n} of 3</p>
      <Card key={step} className="w-full max-w-lg animate-rise">
        <CardHeader>
          <CardTitle>{current.title}</CardTitle>
          <CardDescription>{current.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'business' ? <OrgForm /> : null}
          {step === 'plan' ? (
            <PlanStep
              trialDays={serverEnv.stripeTrialDays()}
              setupFee={serverEnv.stripeSetupFeePriceId() ? pricing.setupFee : undefined}
              notice={checkout ? CHECKOUT_NOTICES[checkout] : undefined} />
          ) : null}
          {step === 'number' ? <NumberStep /> : null}
        </CardContent>
      </Card>
    </main>
  );
}
