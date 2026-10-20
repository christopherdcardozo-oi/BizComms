# Launch checklist

What has to be true before a paying customer can use BizComms. Code items are done; the rest
needs your accounts, your details, or (marked $) a small amount of money. Costs are estimates;
check each provider's current pricing.

## Done in code

- [x] Missed-call text-back, shared inbox, call log, STOP/HELP opt-outs
- [x] AI receptionist (Vapi): disclosure greeting, summaries, transcripts, recordings
- [x] Google review sync, AI drafts, approval workflow (waiting on Google API approval)
- [x] Stripe checkout with a plan picker (Text-Back / Receptionist / Complete), renewal disclosure,
      optional setup fee, and per-plan feature gates (AI receptionist: Receptionist + Complete;
      Google reviews: Complete)
- [x] 200 AI minutes a month, matching the pricing page
- [x] Public demo at `/demo`, Terms, Privacy, favicon, share image, robots.txt, sitemap

## Before you pitch (free)

1. Fill in `src/lib/site.ts`: business name, contact email, mailing address (a P.O. box or virtual
   address is fine). Cold email legally needs a real postal address in every message.
2. Practice the pitch deck five times. Pitch with the demo running locally (`npm run dev`, then
   share the `localhost:3000/demo` tab).
3. Keep a simple sheet of who you contacted, and a do-not-contact list. Honor every opt-out.

## Before your first paying customer

1. **Stripe (free until you charge):** activate your account. In Product catalog, create three
   monthly prices ($29 / $89 / $129) and, if you charge one, a one-time $29 setup price. Put the IDs
   in `STRIPE_PRICE_TEXT_BACK`, `STRIPE_PRICE_RECEPTIONIST`, `STRIPE_PRICE_COMPLETE` (and
   `STRIPE_PRICE_SETUP_FEE`). In Settings → Billing → Customer portal, allow switching between
   the three prices and canceling at period end.
2. **Domain ($, about $10–15 a year):** buy one, then point it at your host.
3. **Hosting:** deploy the Next.js app. Vercel's free Hobby plan doesn't allow commercial use
   (Pro is about $20 a month). Set every variable from `.env.local` on the host, plus
   `NEXT_PUBLIC_APP_URL` and `TWILIO_WEBHOOK_BASE_URL` set to `https://your-domain`.
4. **Scheduled jobs:** call these every few minutes with header `Authorization: Bearer $CRON_SECRET`:
   `/api/cron/replay-webhooks`, `/api/cron/review-sync`, and daily `/api/cron/release-lapsed-numbers`.
   A free scheduler (for example cron-job.org or GitHub Actions) works.
5. **Stripe webhook:** add `https://your-domain/api/stripe/webhook` with the events listed in
   `.env.local.example`, and put the signing secret in `STRIPE_WEBHOOK_SECRET`.
6. **Twilio ($):** upgrade from trial, then register for business texting (A2P 10DLC brand and
   campaign: roughly $20 one-time plus a few dollars a month). Texting doesn't work until the
   campaign is approved, which can take days to weeks. Numbers are about $1–2 a month each.
7. **Vapi ($ per minute):** add a payment method before credits run out; point its webhook at
   `https://your-domain/api/vapi/webhook`.
8. **Rotate secrets** that were pasted into chat or a terminal earlier (Twilio auth token, database
   password, Vapi key) and update them on the host.
9. **Legal:** have a lawyer review the Terms and Privacy policy. Forming an LLC is optional but
   separates your personal assets from the business.

## Later

- Google Business Profile API approval (reviews stay "coming soon" until then)
- Real customer quotes, with permission, on the site and in the deck
