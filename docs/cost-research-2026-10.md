# Cost research: cheapest stack at the same quality (October 2026)

Prices were taken from official pricing pages on 2026-10-22 unless marked "est." (worked out from
component prices) or "3P" (third-party source). Prices change, so re-check before switching.

## Where the money goes (one Receptionist customer, per month)

Assumed usage: 1 number, 100 texts sent and 50 received, 300 minutes of calls forwarded to the
owner's cell, and 100 AI receptionist minutes.

| Cost | Today | After the "now" steps | At scale |
|---|---|---|---|
| Phone + texting (Twilio → Telnyx at scale) | $13.21 | $13.21 | $9.72 |
| AI receptionist minutes | ~$9.00 (100 min × ~$0.09) | ~$5.60 (80 min × ~$0.07) | ~$4.40 (Ultravox) or less (self-built) |
| Payment fees on $89 | $3.50 card (2.9% + 30¢ + 0.7% Billing) | $1.34 if they pay by bank (ACH) | $1.34 |
| **Total cost** | **~$25.70** | **~$20.15** | **~$15.50** |
| **You keep, of $89** | **~$63** | **~$69** | **~$73.50** |

**The single biggest cost is forwarding calls to the owner's cell.** Every forwarded minute is
billed twice (inbound leg + outbound leg). That's about $6.75 of the $13.21 phone bill, and it's
why heavy-calling customers on the $29 Text-Back plan make thin margins (~$15).

## 1. AI receptionist platform (all-in $/min, including the ~$0.0125 Twilio leg)

| Option | $/min | Notes | Switching effort |
|---|---|---|---|
| Self-built: Pipecat / LiveKit Agents + Deepgram Nova-3 + gpt-4o-mini + Aura-2 | est. $0.035–0.045 | You build recording, summaries and webhooks, and keep it running | High |
| LiveKit Cloud (same parts, hosted) | est. $0.045–0.06 | Good turn detection; you write the end-of-call webhook | Medium–high |
| OpenAI gpt-realtime-mini direct | est. $0.04–0.07 | Natural, but speech-to-speech is weaker at digits and addresses | Medium–high |
| **Ultravox** | est. ~$0.068 | $0.05/min, SIP, `call.ended` webhook. **Verify:** premium voices included? summary included? (ownership may have changed) | Medium–low |
| Deepgram Voice Agent API | est. ~$0.08–0.09 | Bundled; you build the phone bridge | Medium–high |
| Retell AI | est. ~$0.085–0.09 | Best reputation for turn-taking and number capture; not cheaper | Low |
| **Vapi (current)** | est. ~$0.09–0.10 | $0.05 platform fee is 60–70% of the cost | — |
| ElevenLabs Agents | est. ~$0.095–0.10 | Best voices | Low–medium |
| Bland | $0.12–0.14 | Most expensive | — |
| Gemini Live | n/a | 3–8 s delays over phone lines reported; not viable yet | — |
| Synthflow | n/a | Enterprise only ($30k/yr) | — |

Sources: vapi.ai/pricing · ultravox.ai/pricing · retellai.com/pricing · livekit.com/pricing ·
deepgram.com/pricing · elevenlabs.io/pricing/agents · bland.ai/pricing · developers.openai.com/api/docs/pricing ·
ai.google.dev/gemini-api/docs/pricing · twilio.com/en-us/voice/pricing/us

### Inside Vapi (what to change now)

| Part | Pick | ~$/min | Why |
|---|---|---|---|
| Transcription | Deepgram Nova-3 with `numerals: true` and keyterms | ~$0.0097 | Turns spoken digits into numbers; already the likely default |
| AI model | gpt-4o-mini (keep) | ~$0.002 | Model cost is tiny; choose on reliability |
| Voice | Deepgram Aura-2, or Vapi Voices v2 | ~$0.006–0.0105 | vs ~$0.015–0.024 for ElevenLabs / default |
| Platform | Vapi | $0.05 | Fixed |

**Call settings (cut wasted minutes):** `maxDurationSeconds` 300 (now 600) · `silenceTimeoutSeconds` 20 ·
"Are you still there?" idle prompts at ~8 s, then goodbye · `endCallFunctionEnabled` with one closing
line · voicemail detection **off** (costs extra on inbound) · noise reduction **on** (job-site and
truck noise) · background sound **off** · short fixed greeting · one read-back of the details.

Test 20–30 calls side by side and compare Vapi's per-call cost breakdown before settling.

## 2. Phone and texting (per customer per month, scenario above)

| Provider | Number | SMS out | Voice in / out | SIP | Total | Switching |
|---|---|---|---|---|---|---|
| SignalWire | $0.50 | $0.00415 | $0.0066 / $0.008 | $0.003 | $8.83 | Lowest (Twilio-compatible API); smaller company |
| **Telnyx** | $1.10 | $0.004 | $0.0052 / $0.007 | ~$0.007 (unpublished) | **$9.72** | Medium (TeXML, new signature check) |
| Plivo | $0.50 | $0.0077 | $0.0055 / $0.0115 | $0.0033 | $10.75 | Medium |
| **Twilio (current)** | $1.15 | $0.0083 | $0.0085 / $0.014 | $0.004 | **$13.21** | — |
| Bandwidth | — | $0.004 (3P) | $0.0055 / $0.010 (3P) | quote | — | Reported $2.5k–10k/mo minimum |

Texting registration (A2P 10DLC) is about the same everywhere: brand $4.50 + campaign vetting $15
one-time + $1.50–2/month. Skip the $41.50 "secondary vetting" at ~100 texts/month.

Sources: twilio.com/en-us/sms/pricing/us · twilio.com/en-us/voice/pricing/us · telnyx.com/pricing/messaging ·
telnyx.com/pricing/call-control · telnyx.com/pricing/numbers · support.telnyx.com (10DLC fees) ·
plivo.com/sms/pricing/us · plivo.com/voice/pricing/us · signalwire.com/pricing

## 3. Hosting, database, scheduled jobs, domain

| Item | Pick | Cost | Notes |
|---|---|---|---|
| Hosting | **Vercel Pro** | $20/mo | No migration; includes scheduled jobs every minute (Hobby: once a day, non-commercial only) |
| Hosting (cheaper) | Railway Hobby | ~$5–8/mo (est.) | Always on, no code changes; scheduled jobs move to QStash/pg_cron |
| Hosting (cheapest) | Cloudflare Workers Paid | $5/mo | Twilio SDK and Next 16 compatibility uncertain: medium–high effort |
| Database | Supabase **Free** until the first paying customer, then **Pro** | $0 → $25/mo | Free: no backups; pauses only after a week without database activity (scheduled jobs prevent it) |
| Scheduled jobs | Vercel crons (on Pro) or Upstash QStash free | $0 | QStash free: 1,000 runs/day with retries |
| Domain | Cloudflare Registrar | $10.46/yr | Sold at cost |

Sources: vercel.com/pricing · railway.com/pricing · developers.cloudflare.com/workers/platform/pricing ·
supabase.com/pricing · supabase.com/docs/guides/platform/free-project-pausing · upstash.com/pricing/qstash ·
cfdomainpricing.com

## 4. Review-reply AI and payments

- **Review AI:** under $0.05/month per 10 customers on any model. Keep gpt-4o-mini. Price doesn't matter here.
- **Payments:** stay on Stripe. **Add bank payments (ACH):** 0.8% (max $5) + 0.7% Billing, which is $0.44 on $29
  and $1.34 on $89, vs $1.34 and $3.50 by card. Paddle and Lemon Squeezy cost more (5% + 50¢).

Sources: developers.openai.com/api/docs/pricing · stripe.com/pricing · paddle.com/pricing

## Plan

| When | Change | Effort | Saves |
|---|---|---|---|
| **Now** | Tune Vapi (settings + cheaper voice + numerals) | Low (code) | ~$3–4 per Receptionist customer per month |
| **Now** | Offer ACH at checkout; push annual plans | Low (code) | ~$1–2 per customer per month |
| **Now** | Fair-use cap on forwarded minutes for Text-Back ($29) | Low (terms + pricing page) | Protects margin on heavy callers |
| First customer | Supabase Free → Pro when the first customer pays | None | — |
| ~10 customers | Trial Ultravox (verify voices + summary) | Medium | ~$2–3 per Receptionist customer |
| ~25+ customers | Move new customers to Telnyx (port the rest in batches) | Medium | ~$3.50 per customer |
| 100+ customers | Self-built voice agent (LiveKit / Pipecat) | High | ~$5+ per Receptionist customer |
| Never | Switching review AI, Paddle/Lemon Squeezy, Firebase/Neon | — | Costs more or saves pennies |
