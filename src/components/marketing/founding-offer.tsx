import { Check } from 'lucide-react';
import { foundingOffer } from '@/lib/site';
import { cn } from '@/lib/ui/cn';

// The founding customer offer (src/lib/site.ts), on the pricing section and the book-a-demo page.
export function FoundingOffer({ className }: { className?: string }) {
  return (
    <section aria-labelledby="founding-offer" className={cn('flex flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-6', className)}>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          First {foundingOffer.spots} businesses · until {foundingOffer.deadline}
        </p>
        <h3 id="founding-offer" className="text-lg font-semibold">
          Founding customer offer
        </h3>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {foundingOffer.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-sm">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {perk}
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium">{foundingOffer.guarantee}</p>
    </section>
  );
}
