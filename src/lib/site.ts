// Public business details used by the marketing site and legal pages.
// TODO before launch: replace the placeholders with your real legal entity and contact details.
export const siteConfig = {
  name: 'BizComms',
  legalName: 'BizComms', // e.g. "BizComms LLC" once registered
  contactEmail: 'support@bizcomms.example', // a real inbox on your domain
  mailingAddress: '[Business mailing address]',
  governingState: 'Iowa',
  legalEffectiveDate: 'October 20, 2026',
};

// Launch mode. Until texting and billing are live for real customers, the public site books demos
// instead of taking signups. Set NEXT_PUBLIC_SIGNUPS_OPEN="true" to open self-serve signup.
export const launch = {
  signupsOpen: process.env.NEXT_PUBLIC_SIGNUPS_OPEN === 'true',
  bookingUrl: process.env.NEXT_PUBLIC_BOOKING_URL || '',
};

export const primaryCta = launch.signupsOpen ? { href: '/signup', label: 'Get started' } : { href: '/book', label: 'Book a demo' };

// Public pricing shown on the landing page. Edit freely; nothing else reads these yet.
// NOTE: checkout currently sells one Stripe price (STRIPE_PRICE_STARTER) and every subscriber gets
// every feature. Wire one Stripe price per plan + per-plan feature gates before advertising tiers.
// Fair-use allowance for calls forwarded to the owner's phone on Text-Back. Each forwarded minute is
// billed twice by the carrier (in + out), so heavy callers belong on a bigger plan. Calls are never
// blocked or stopped because of it (Terms §11).
export const TEXT_BACK_FORWARDED_MINUTES = 500;

export interface PricingPlan {
  id: 'text-back' | 'receptionist' | 'complete';
  name: string;
  monthly: number;
  blurb: string;
  features: string[];
  highlighted?: boolean;
}

export const pricing = {
  currency: '$',
  setupFee: 29, // one-time; covers carrier (A2P 10DLC) registration; waived on annual plans
  annualMonthsFree: 2,
  // Unit-cost check (estimates): number ~$1-2/mo, texts ~1c, ringing the owner ~2c/min,
  // AI receptionist ~$0.10-0.20/min (confirm on the first Vapi invoice), AI review replies <1c.
  plans: [
    {
      id: 'text-back',
      name: 'Text-Back',
      monthly: 29,
      blurb: 'Never lose a missed caller again.',
      features: [
        'Local business number',
        'Instant text-back to missed callers',
        'Shared text inbox',
        'Call log',
        'Opt-out handling built in',
        `Up to ${TEXT_BACK_FORWARDED_MINUTES} forwarded call minutes/month`,
      ],
    },
    {
      id: 'receptionist',
      name: 'Receptionist',
      monthly: 89,
      blurb: 'An AI that answers when you can’t.',
      features: [
        'Everything in Text-Back',
        'AI receptionist, 200 minutes/month',
        'Call summaries, transcripts and recordings',
        'After-hours call handling',
        'Text-back if a caller hangs up on the AI',
      ],
      highlighted: true,
    },
    {
      id: 'complete',
      name: 'Complete',
      monthly: 129,
      blurb: 'Calls, texts and your Google reputation.',
      features: ['Everything in Receptionist', 'AI replies to every Google review', 'Auto-post replies to happy reviews', 'Approve critical replies first'],
    },
  ] satisfies PricingPlan[],
};

// What a business typically pays for the same jobs as separate tools (2026 public price ranges
// from comparison guides; deliberately generic categories, not named competitors).
export const separateToolsComparison = [
  { label: 'Missed-call text-back tool', range: '$29–149/mo', low: 29 },
  { label: 'AI receptionist service', range: '$99–299/mo', low: 99 },
  { label: 'Review management platform', range: '$299–449/mo', low: 299 },
];
