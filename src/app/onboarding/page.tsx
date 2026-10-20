import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canManage, requireUser } from '@/lib/auth/session';
import { NumberStep } from './number-step';
import { OrgForm } from './org-form';

export const metadata = { title: 'Get started · BizComms' };

export default async function OnboardingPage() {
  const session = await requireUser();

  let step: 'business' | 'number' = 'business';
  if (session.organizationId) {
    const { count } = await session.supabase
      .from('twilio_configs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId);
    if ((count ?? 0) > 0 || !canManage(session.role)) redirect('/dashboard');
    step = 'number';
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <p className="text-xl font-semibold tracking-tight">BizComms</p>
      <p className="text-sm text-muted-foreground">Step {step === 'business' ? 1 : 2} of 2</p>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{step === 'business' ? 'Tell us about your business' : 'Get your business number'}</CardTitle>
          <CardDescription>
            {step === 'business'
              ? 'You can change these later.'
              : 'Customers call this number. We ring your phone, and text back anyone you miss.'}
          </CardDescription>
        </CardHeader>
        <CardContent>{step === 'business' ? <OrgForm /> : <NumberStep />}</CardContent>
      </Card>
    </main>
  );
}
