import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { NavLink } from '@/components/dashboard/nav-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { serverEnv } from '@/lib/config/env';
import { requireOrganization } from '@/lib/auth/session';
import { billingAllowsService } from '@/lib/billing/status';
import { releaseDate, resolveGraceDays, RELEASABLE_STATUSES } from '@/lib/numbers/release';
import { getA2pStatus, getPrimaryLine } from '@/lib/dashboard/queries';
import { formatNanp } from '@/lib/numbers/phone';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOrganization();
  const [line, a2pStatus] = await Promise.all([getPrimaryLine(session.supabase), getA2pStatus(session.supabase)]);
  const textingBlocked = a2pStatus !== 'approved' && !serverEnv.useMockSms();
  const billingActive = billingAllowsService(session.subscriptionStatus);
  const releasesOn =
    line && session.subscriptionStatusChangedAt && (RELEASABLE_STATUSES as readonly string[]).includes(session.subscriptionStatus ?? '')
      ? releaseDate(session.subscriptionStatusChangedAt, resolveGraceDays(serverEnv.numberReleaseGraceDaysRaw()))
      : null;

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight">{session.organizationName ?? 'BizComms'}</span>
            {line ? <span className="text-xs text-muted-foreground">{formatNanp(line.twilio_phone_number)}</span> : null}
          </div>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink href="/dashboard">Calls</NavLink>
            <NavLink href="/dashboard/inbox">Inbox</NavLink>
            <NavLink href="/dashboard/reviews">Reviews</NavLink>
            <NavLink href="/dashboard/settings">Settings</NavLink>
          </nav>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="container flex flex-col gap-6 py-6">
        {!line ? (
          <Alert>
            You don&apos;t have a business number yet.{' '}
            <Link href="/onboarding" className="font-medium text-primary underline-offset-4 hover:underline">
              Get one now
            </Link>
            .
          </Alert>
        ) : null}
        {!billingActive ? (
          <Alert variant="destructive">
            {session.subscriptionStatus === 'none'
              ? 'Start your subscription to turn on missed-call text-back. '
              : 'Your subscription is inactive: calls still ring your phone, but text-backs are paused. '}
            {releasesOn && line
              ? `Your number ${formatNanp(line.twilio_phone_number)} will be released on ${releasesOn.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })} unless you reactivate. `
              : null}
            <Link
              href={session.subscriptionStatus === 'none' ? '/onboarding' : '/dashboard/settings'}
              className="font-medium underline underline-offset-4"
            >
              {session.subscriptionStatus === 'none' ? 'Choose a plan' : 'Update billing'}
            </Link>
          </Alert>
        ) : null}
        {line && billingActive && textingBlocked ? (
          <Alert>
            Calls are forwarding, but texts are paused until your carrier registration (A2P 10DLC) is approved
            {a2pStatus === 'pending' ? '. Approval is in progress.' : '. Contact support to start registration.'}
          </Alert>
        ) : null}
        {children}
      </main>
    </div>
  );
}
