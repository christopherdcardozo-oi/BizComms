import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canManage, requireOrganization } from '@/lib/auth/session';
import { getPrimaryLine } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'Settings · BizComms' };

export default async function SettingsPage() {
  const session = await requireOrganization();
  const line = await getPrimaryLine(session.supabase);

  return (
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
  );
}
