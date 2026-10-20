import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canManage, requireOrganization } from '@/lib/auth/session';
import { PLAN_NAMES, planForPrice } from '@/lib/billing/plans';
import { describeSubscription } from '@/lib/billing/status';
import { getGoogleConnection, getOrganizationDetails, getPrimaryLine } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';
import { BillingCard } from './billing-card';
import { GoogleCard } from './google-card';
import { ProfileCard } from './profile-card';
import { ReceptionistCard } from './receptionist-card';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'Settings · BizComms' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const session = await requireOrganization();
  const [line, org, google, { google: googleResult }] = await Promise.all([
    getPrimaryLine(session.supabase),
    getOrganizationDetails(session.supabase, session.organizationId),
    getGoogleConnection(session.supabase),
    searchParams,
  ]);

  return (
    <>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Call &amp; text-back settings</CardTitle>
          <CardDescription>
            {line ? `For your business number ${formatNanp(line.twilio_phone_number)}.` : 'Add a business number to configure call handling.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {line ? (
            <SettingsForm
              businessName={session.organizationName ?? 'your business'}
              forwardTo={formatNanp(line.forward_to_number)}
              forwardTimeoutSeconds={line.forward_timeout_seconds}
              missedCallSmsEnabled={line.missed_call_sms_enabled}
              missedCallSmsTemplate={line.missed_call_sms_template}
              canEdit={canManage(session.role)}
            />
          ) : null}
        </CardContent>
      </Card>
      {line ? (
        <ReceptionistCard
          enabled={line.ai_voice_enabled}
          afterHoursDirectToAi={line.after_hours_direct_to_ai}
          ringSeconds={line.forward_timeout_seconds}
          canEdit={canManage(session.role)}
        />
      ) : null}
      <ProfileCard
        timezone={org.timezone}
        hours={org.business_hours}
        instructions={org.ai_receptionist_prompt ?? ''}
        aiProvisioned={!!org.vapi_phone_number_id}
        canEdit={canManage(session.role)}
      />
      <GoogleCard connection={google} canEdit={canManage(session.role)} result={googleResult} />
      {session.stripeCustomerId ? (
        <BillingCard
          planName={PLAN_NAMES[planForPrice(session.stripePriceId)]}
          statusLabel={describeSubscription(session.subscriptionStatus)}
          healthy={session.subscriptionStatus === 'active' || session.subscriptionStatus === 'trialing'}
          canEdit={canManage(session.role)}
        />
      ) : null}
    </>
  );
}
