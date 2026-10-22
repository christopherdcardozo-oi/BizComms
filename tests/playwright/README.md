# Browser and webhook tests (Playwright)

```bash
npm run test:pw
```

- **What it runs:** a real Next.js dev server on port 3020 against the **test** Supabase project in
  `.env.local`. Each test file gets a throwaway business and owner login, deleted afterwards.
- **Stop `npm run dev` first.** Next.js allows one dev server per project folder.
- **Report:** `npx playwright show-report`. Failed tests keep a trace and screenshot in `test-results/`.

## Why nothing is ever charged

| Outside service | How the tests avoid it |
|---|---|
| Twilio (incoming webhooks) | Requests are signed with a test-only auth token, so the **real** signature check runs and forged or unsigned calls are rejected. |
| Twilio (outgoing texts) | `USE_MOCK_SMS=true`: the app writes the `messages` row with an `SM_mock_…` id instead of calling Twilio. The app refuses mock mode when `NODE_ENV=production`. |
| Stripe | `USE_MOCK_BILLING=true`. The seeded business is already `active`. |
| Vapi | `USE_MOCK_VOICE_AI=true`. |
| Google / OpenAI | `USE_MOCK_GOOGLE_REVIEWS=true`, `LLM_PROVIDER=mock`. |

**Why not Next.js "experimental test mode" fetch interception?** It only intercepts `fetch` and
`http.get`. The Twilio SDK sends requests through axios, so those calls would slip past it.
Mocking at the provider layer catches every path the app uses.

## What each test checks in the database

| Test | Database assertion |
|---|---|
| Inbox reply | `messages`: outbound, from the business number, `manual_chat`, `SM_mock_` id |
| Tenant isolation | Another business's `call_logs.id` returns 404 from this business's session |
| Business profile save | `organizations.business_profile` has the trade and service area |
| Unsigned webhook | No `call_logs` row is written |
| Signed incoming call | `call_logs`: this org, status `ringing`, caller number |
| Missed call | `call_logs.outcome = missed_call_texted`, `sms_rescued = true`. Exactly one `messages` row (`missed_call_auto_reply`, contains the business name and STOP language), still one after Twilio redelivers |
| STOP | `sms_opt_outs.source = inbound_stop`, and the next missed call writes no outbound text |

## Failure scenarios: where each is covered

Unit tests (`npm run test:unit`) cover most failure paths with in-memory fakes. Playwright
covers the ones that need real HTTP and a real database.

| Scenario | Covered by |
|---|---|
| Forged or missing Twilio signature | Playwright `webhooks.spec.ts`, unit `telephony.test.ts` |
| Malformed Twilio payload (no CallSid) | Playwright (400), unit (dead-lettered in replay) |
| Duplicate / redelivered callbacks | Playwright (one text-back), unit (status dedupe) |
| Out-of-order status before incoming-call | E2E `module-a.e2e.ts` |
| Database outage during a call | Unit: 503 → Twilio fallback URL, buffered replay, cached line config |
| AI receptionist (SIP) fails | Unit: falls back to text-back |
| Expired Google access token | Unit: refreshed and re-encrypted before calling Google |
| Google publish or AI draft fails | Unit: degrades to manual review / failed with a message |
| Tampered or expired OAuth state | Unit `reviews.test.ts` |
| Stripe: bad signature, duplicate, stale event | Unit `billing.test.ts` |
| Vapi: bad secret, DB failure | Unit `voice.test.ts` |
| Kill switch, quotas, unapproved A2P, opt-outs | Unit `telephony.test.ts`, `sms.test.ts` |

**Not covered yet (next candidates):**
- A Google refresh token that was revoked by the owner (not just expired) → should show "Reconnect Google"
- Twilio API timeout on an outgoing reply → the inbox should show "not delivered"
- Stripe Checkout end to end in the browser with test card 4242 (needs `USE_MOCK_BILLING=false` and the Stripe CLI for webhooks)
- Mobile viewport runs of the dashboard
