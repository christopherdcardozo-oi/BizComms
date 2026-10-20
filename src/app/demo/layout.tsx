import Link from 'next/link';
import { NavLink } from '@/components/dashboard/nav-link';
import { Button } from '@/components/ui/button';
import { DEMO_BUSINESS } from '@/lib/demo/data';
import { formatNanp } from '@/lib/numbers/phone';
import { siteConfig } from '@/lib/site';

export const metadata = {
  title: `Live demo · ${siteConfig.name}`,
  description: 'Click around a sample dashboard: missed-call text-backs, AI receptionist transcripts and Google review replies.',
};

// Public, no-login demo with sample data for a fictional business. Same views as /dashboard.
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="border-b bg-primary/10">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
          <p>
            <span className="font-medium">Live demo.</span> Sample data for a fictional business. Nothing here sends real calls, texts or
            replies.
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Back to site</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </div>
      <header className="border-b">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight">{DEMO_BUSINESS.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatNanp(DEMO_BUSINESS.number)}</span>
          </div>
          <nav className="flex items-center gap-1" aria-label="Demo">
            <NavLink href="/demo">Calls</NavLink>
            <NavLink href="/demo/inbox">Inbox</NavLink>
            <NavLink href="/demo/reviews">Reviews</NavLink>
          </nav>
        </div>
      </header>
      <main className="container flex flex-col gap-6 py-6">{children}</main>
    </div>
  );
}
