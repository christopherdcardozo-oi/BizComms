# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary (confirmed):** owner-operators of home-service trades businesses — plumbers, HVAC techs,
electricians, roofers, cleaners — typically small crews. Their job: win the work that calls in while
they are on a job, driving, or after hours, without hiring a receptionist.

**Secondary (from the product's roles):** office staff or crew members who answer customer texts from
the shared inbox and review drafted Google replies (member role), and co-owners/managers who change
settings and approve publishing (admin role).

**Channel audience (confirmed, second priority):** marketing agencies that serve local businesses and
may resell the product to their clients. Owners come first; agencies are a later channel.

## Product Purpose

Stop local service businesses from losing customers to missed calls and unanswered reviews.
It does three jobs in one product: texts back callers the owner misses, answers with an AI
receptionist when the owner can't, and drafts (and optionally posts) replies to Google reviews.
Success is measured in recovered leads: missed callers who got a reply, after-hours calls captured
with a usable summary, and reviews answered — with zero dropped calls and zero compliance incidents.

## Positioning

- One product for three jobs that competitors sell separately (text-back tool, answering service,
  review platform): one number, one inbox, one call log, one bill.
- The owner's phone rings first. The AI only steps in when the owner doesn't answer, so regular
  customers still reach a person.
- Nobody slips through: a caller who hangs up on the AI still gets a text, and nobody is texted
  twice for the same call.
- Calls are never dropped by the product: if the app fails, the call still rings the owner.
- Review replies to happy customers can post automatically; anything critical waits for the owner.
- Priced well under the separate-tools alternative, with public, no-contract pricing.

## Operating Context

- Owners use it from a phone, between jobs, often outdoors, in a truck, or with dirty or gloved
  hands; they glance rather than study. *(Inferred from the trades audience; not yet observed.)*
- Calls arrive on a local business number that forwards to the owner's existing cell. The owner
  keeps using their phone as usual; the product works around them.
- Customers reach the business by calling the number on its website, truck, or Google profile,
  and continue by text from the business number.
- Setup is self-serve: sign up, pick a local number, set the forwarding phone, optionally turn on
  the AI receptionist and connect Google.

## Capabilities and Constraints

- Built: missed-call text-back with shared inbox and replies; AI receptionist (Vapi) with summaries,
  transcripts and recordings; Google review sync with AI-drafted replies and an approval workflow;
  call log; business hours; Stripe subscriptions; STOP/HELP opt-out handling.
- Legal and carrier constraints shape every customer-facing message: TCPA consent, carrier
  registration (A2P 10DLC) before texting works, opt-out language in the first text, and AI plus
  call-recording disclosure in the receptionist's greeting.
- Google review publishing requires Google's API approval (pending); AI review replies must never
  offer incentives, admit fault, or invent facts.
- Plans and prices live in `src/lib/site.ts`. Checkout does not yet enforce per-plan features.
- Undecided: the final product name (see Brand Commitments); agency white-label / reseller features
  (not built); the legal entity and contact details used on legal pages.

## Brand Commitments

- Name: **RingBack Crew** (chosen October 2026; ringbackcrew.com was unregistered at the time). The name lives in
  `src/lib/site.ts`. Founder: Chris Cardozo. "Ringback" is a common telephony term, so register the
  domain and consider a trademark search before investing in the brand.
- Voice: plain, direct, owner-to-owner language; no jargon, no hype, no invented numbers.

## Evidence on Hand

- None yet: no customers, testimonials, logos, case studies, usage statistics, or press.
  Future work must not fabricate any of these.
- Product demos on the marketing site use clearly fictional example content (e.g. "Acme Plumbing")
  to illustrate how the product works; keep them illustrative, never presented as real customers.
- Competitor price ranges on the site come from 2026 public comparison guides and are shown as
  generic categories, not named competitors.

## Product Principles

1. Never lose the caller: every path — answered, missed, AI, outage — ends with the customer
   reached or texted, exactly once.
2. The owner stays in charge: automation handles the routine, and anything that could embarrass
   the business in public waits for the owner.
3. Compliance is built in, not left to the customer.
4. Fits a busy owner's day: usable in seconds from a phone, between jobs.
5. Honest by default: real capabilities, public prices, no fabricated proof.

## Accessibility & Inclusion

WCAG 2.1 AA for contrast, text size, and keyboard use across the marketing site and app; respect
reduced-motion preferences. Large, easy touch targets for one-handed phone use are a working
assumption for the trades audience *(inferred)*.
