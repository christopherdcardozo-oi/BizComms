import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FoundingOffer } from '@/components/marketing/founding-offer';
import { launch, siteConfig } from '@/lib/site';

export const metadata = {
  title: `Book a demo · ${siteConfig.name}`,
  description: `See ${siteConfig.name} on a 15-minute video call: missed-call text-back, an AI receptionist and Google review replies.`,
};

// Where every "Book a demo" button leads while self-serve signup is closed.
export default function BookPage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-20">
      <h1 className="text-title">Book a 15-minute demo</h1>
      <p className="text-lg text-muted-foreground">
        We&apos;re setting up our first businesses personally. On a short video call you&apos;ll see the real product: what your callers get when
        you can&apos;t pick up, and how the AI receptionist hands you the job details. No pressure, no contract.
      </p>
      <div className="flex flex-wrap gap-3">
        {launch.bookingUrl ? (
          <Button asChild size="lg">
            <a href={launch.bookingUrl} target="_blank" rel="noopener noreferrer">
              Pick a time
            </a>
          </Button>
        ) : (
          <Button asChild size="lg">
            <a href={`mailto:${siteConfig.contactEmail}?subject=Demo%20request`}>Email to book a time</a>
          </Button>
        )}
        <Button asChild size="lg" variant="outline">
          <Link href="/demo">Look around the demo first</Link>
        </Button>
      </div>
      <FoundingOffer />
      <p className="text-sm text-muted-foreground">
        Prefer email? Write to <a href={`mailto:${siteConfig.contactEmail}`} className="underline underline-offset-4">{siteConfig.contactEmail}</a>.
      </p>
    </section>
  );
}
