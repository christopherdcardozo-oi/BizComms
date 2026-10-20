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

// Public pricing shown on the landing page. Edit freely; nothing else reads these yet.
// NOTE: checkout currently sells one Stripe price (STRIPE_PRICE_STARTER) and every subscriber gets
// every feature. Wire one Stripe price per plan + per-plan feature gates before advertising tiers.
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
  setupFee: 49, // one-time; covers carrier (A2P 10DLC) registration
  annualMonthsFree: 2,
  plans: [
    {
      id: 'text-back',
      name: 'Text-Back',
      monthly: 49,
      blurb: 'Never lose a missed caller again.',
      features: ['Local business number', 'Instant text-back to missed callers', 'Shared text inbox', 'Call log', 'Opt-out handling built in'],
    },
    {
      id: 'receptionist',
      name: 'Receptionist',
      monthly: 149,
      blurb: 'An AI that answers when you can’t.',
      features: ['Everything in Text-Back', 'AI receptionist, 300 minutes/month', 'Call summaries, transcripts and recordings', 'After-hours call handling', 'Custom receptionist instructions'],
      highlighted: true,
    },
    {
      id: 'complete',
      name: 'Complete',
      monthly: 199,
      blurb: 'Calls, texts and your Google reputation.',
      features: ['Everything in Receptionist', 'AI replies to every Google review', 'Auto-post replies to happy reviews', 'Approve critical replies first'],
    },
  ] satisfies PricingPlan[],
};
