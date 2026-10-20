# Local Business Communications OS - Architecture & Design Notes (Revision 3)

---

### 1. Telephony Handshake, SIP Bridging & Hangup Analysis

- **The Twilio SIP Limitation**:
  When Twilio bridges an inbound call to Vapi via `<Dial><Sip>sip:assistant_id@sip.vapi.ai</Sip></Dial>`, Twilio's call leg simply marks the dial as `completed` once either party hangs up. Twilio cannot inspect dialog progression, assistant speech-to-text latency, or conversational intent inside the SIP session.
- **Configurable Abandonment Threshold**:
  Each location stores its own `abandon_threshold_seconds` (default: 8 seconds, stored in `twilio_configs.abandon_threshold_seconds`). This allows service businesses with distinct caller patterns (e.g. 5s for emergency towing vs 12s for medical clinics) to customize rescue triggering.
- **Outcome Classification & Rescued SMS Trigger**:
  - **Case A: Abandoned before AI**: The caller rings the business phone for 15s without an answer, or hangs up before the SIP bridge connects. Twilio's `dial-status` callback receives `canceled` or `no-answer` (without SIP pickup). Twilio webhook triggers the instant rescue SMS directly.
  - **Case B: Abandoned during/after AI connection**: The call was connected to Vapi. Twilio marks the call `completed`. The true outcome is determined **exclusively** by the Vapi `end-of-call-report` webhook via `endedReason` (e.g. `customer-ended-call`, `silence-timed-out`, `assistant-error`, `pipeline-error-vapi-limits-exceeded`) and `durationSeconds`.
  - If `durationSeconds < twilio_configs.abandon_threshold_seconds` or `endedReason` indicates an abrupt disconnect before inquiry intake, the **Vapi webhook handler** dispatches the rescue SMS, updating `call_logs.outcome = 'caller_abandoned_before_ai'`. If the interaction succeeded, `call_logs.outcome = 'ai_conversation_completed'`.
  - This architecture eliminates duplicate SMS text-backs and maintains single-source-of-truth audit records.
- **Out-of-Order Webhook Protection**:
  All webhook writes to `call_logs` use non-destructive upserts that guard terminal statuses:
  ```sql
  INSERT INTO public.call_logs (call_sid, organization_id, from_number, to_number, status, outcome)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (call_sid) DO UPDATE SET
      status = CASE 
          WHEN public.call_logs.status IN ('completed', 'failed', 'busy', 'no-answer', 'canceled') THEN public.call_logs.status
          ELSE EXCLUDED.status
      END,
      outcome = COALESCE(EXCLUDED.outcome, public.call_logs.outcome),
      child_call_sid = COALESCE(EXCLUDED.child_call_sid, public.call_logs.child_call_sid),
      vapi_ended_reason = COALESCE(EXCLUDED.vapi_ended_reason, public.call_logs.vapi_ended_reason),
      duration_seconds = GREATEST(public.call_logs.duration_seconds, EXCLUDED.duration_seconds),
      ended_at = COALESCE(EXCLUDED.ended_at, public.call_logs.ended_at);
  ```

---

### 2. Carrier Voicemail Traps & Conditional Forwarding Checklist

- **The Problem**:
  If a business owner forwards incoming calls to their personal cell phone, and their cell is off, out of reception, or sends the caller to personal carrier voicemail within the 15-second window, Twilio interprets the carrier voicemail greeting as a **human answer** (`DialCallStatus = 'completed'`). The call never transfers to the Vapi AI receptionist.
- **Why Raw Dial Codes Are Unreliable**:
  Carrier MMI/USSD dial codes (e.g., `*71`, `*61*`, `**004*`) vary significantly across carriers, MVNOs (Mint, Cricket, Visible), device operating systems, and account types (prepaid vs postpaid business). Unverified codes can inadvertently enable unconditional forwarding or disable voicemail entirely.
- **Carrier Onboarding Checklist**:
  Instead of prompting users to punch in raw codes, the SaaS onboarding UI guides the business owner through carrier-specific settings:
  1. **Carrier App / Web Portal Configuration**:
     - **Verizon Business / Wireless**: Configure *Call Forwarding -> Forward when Unanswered* via My Verizon portal or business manager to forward to the platform number after 25+ seconds, or disable mobile voicemail.
     - **AT&T Business / Wireless**: Configure *Call Forwarding No Answer* via myAT&T Business portal or set ring timer to maximum (30 seconds) so Twilio's 15-second `<Dial timeout="15">` timer always triggers first.
     - **T-Mobile**: Manage *Unanswered Call Forwarding* via T-Mobile account settings or set ring delay to 30 seconds.
  2. **Recommended Standard Setup (SIP / Softphone App)**:
     Recommend using a dedicated mobile VoIP softphone app (or direct Twilio WebRTC client in the dashboard) instead of cellular forwarding. This completely bypasses personal carrier voicemails and ensures 100% deterministic routing to the AI assistant.

---

### 3. Webhook Execution Model & Rate Limiting Architecture

- **Twilio Webhooks: Signature Validation ONLY (No IP Rate Limiting)**:
  - Twilio distributes webhook traffic dynamically across massive IP ranges. Applying a blanket IP rate limit (e.g. 60 req/min) to `/api/twilio/*` risks dropping legitimate incoming customer calls or status callbacks during high-volume spikes or marketing campaigns.
  - Webhook authenticity is cryptographically guaranteed by verifying the `X-Twilio-Signature` header against the `TWILIO_AUTH_TOKEN` and full URL/body payload via `src/lib/twilio/validate.ts`.
- **Targeted Rate Limiting (`@upstash/ratelimit`)**:
  Rate limiting is applied strictly to non-webhook endpoints to prevent abuse:
  - **Authentication Routes (`/api/auth/*`)**: 10 requests / minute per IP to prevent brute-force attacks.
  - **Public / Client API Routes (`/api/reviews/*`, `/dashboard/*`)**: 60 requests / minute per authenticated user/session.
  - **Cron Endpoints (`/api/cron/*`)**: Protected by constant-time bearer token validation (`CRON_SECRET`) + 10 requests / minute ceiling.
- **Idempotency & Fast 200 Ack**:
  - Every provider event checks `webhook_events (provider, event_id)`. If already recorded, returns HTTP `200` immediately.
  - Routes return HTTP `200` within 1,500ms, delegating background AI synthesis and transcript archiving.

---

### 4. Google Business Profile API Architecture & Verified Endpoints

- **Official API Documentation & Endpoint Verification**:
  - **Official Docs Reference**: [Google Business Profile API: Reviews Resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews)
  - **Official Update Reply Reference**: [Google Business Profile API: updateReply Method](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply)
- **Verified REST Endpoints**:
  - **List Reviews**:
    ```http
    GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews
    ```
  - **Create or Update Review Reply** (*Method is `PUT`, NOT `PATCH`*):
    ```http
    PUT https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
    Content-Type: application/json

    {
      "comment": "Thank you for supporting our local business!"
    }
    ```
  - **Delete Review Reply**:
    ```http
    DELETE https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
    ```
- **Clarification on Scope and APIs**:
  - Reviews are managed under `mybusiness.googleapis.com/v4`, **not** `mybusinessqanda` (which handles consumer Questions & Answers).
  - Required OAuth2 Scope: `https://www.googleapis.com/auth/business.manage`
- **Pluggable Mock Architecture**:
  Commercial API access approval from Google requires business verification. The codebase uses `IGoogleReviewsService` with a complete `MockGoogleReviewsService` fixture layer toggled by `USE_MOCK_GOOGLE_REVIEWS="true"` in `.env.local`, unblocking end-to-end development.

---

### 5. Outbound SMS Compliance & TCPA / 10DLC Regulations

- **TCPA Opt-Out Registry**:
  The `sms_opt_outs` table stores tenant-specific opt-outs. Inbound messages checking carrier keywords (**STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT**) automatically insert phone numbers into `sms_opt_outs` and prevent outbound SMS.
- **A2P 10DLC Verification**:
  Outbound text-back messages are routed via `TWILIO_MESSAGING_SERVICE_SID` linked to approved Brand and Campaign registrations to prevent carrier filtering.

---

### 6. Fail-Open Telephony Architecture & Webhook Response-Time Budgets

- **The Fail-Open Imperative**:
  A local service business (plumber, HVAC, roofer, clinic) relies on inbound phone calls for revenue. A dropped incoming call due to a cloud outage or database cold start is catastrophic. Under no circumstances should a caller hear a busy signal or error message because of an application or database failure.
- **Decoupled Fallback: Twilio TwiML Bin (Independent of App Deployment)**:
  - **Why Same-App Fallbacks Are Flawed**: If the primary webhook fails due to a Netlify/Cloudflare edge outage, DNS failure, platform routing crash, or expired deployment secret, any secondary fallback route hosted on the *same application deployment* (e.g., `app.bizcomms.com/api/incoming-call/fallback`) will fail for the exact same reason.
  - **Independent Infrastructure**: Every provisioned Twilio phone number is backed by a dedicated **Twilio TwiML Bin** hosted natively on Twilio's serverless edge infrastructure (`handler.twilio.com/twiml/EH...`).
  - **TwiML Bin Content**:
    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <!-- Pure Edge Fail-Open: Connect caller directly to owner phone with zero dependency on app servers -->
      <Dial timeout="30">
        <Number>+12025550199</Number>
      </Dial>
    </Response>
    ```
  - **IncomingPhoneNumber Configuration**:
    - `VoiceUrl`: `https://app.bizcomms.example/api/incoming-call` (Primary App Route, HTTP POST)
    - `VoiceFallbackUrl`: `https://handler.twilio.com/twiml/EHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (Twilio TwiML Bin, HTTP GET)
    - If our primary route fails, crashes, or exceeds the timeout, Twilio switches to the TwiML Bin internally within its telecom switching plane without touching our servers.
- **Synchronization Architecture & Twilio TwiML Bin API Verification**:
  - **API Verification Note (Oct 2026)**: Official Twilio documentation and developer support confirm that **Twilio TwiML Bins have NO public REST API** for programmatic CRUD operations. TwiML Bins are designed strictly as lightweight, static tools managed manually in the Twilio Console UI.
  - **Verified Implementation Alternatives for Decoupled Edge Fail-Open**:
    1. **Alternative A (Recommended: Hardened Edge Fallback Worker)**:
       - Host a zero-dependency static function on an independent edge provider (e.g., Cloudflare Workers or AWS Lambda) at `https://fallback.bizcomms.example/fail-open?to=%2B12025550199&sig=a8f...`.
       - Because Cloudflare / AWS runs on an entirely isolated infrastructure from the primary hosting provider (Vercel / Supabase), this guarantees 100% independent failure domain isolation.
       - **Anti-Fraud & Security Hardening**:
         - **Strict E.164 Validation**: The worker asserts `to` matches `^\+[1-9]\d{6,14}$`. Malformed inputs are rejected immediately with HTTP 400.
         - **HMAC Destination Integrity**: To prevent destination hijacking or toll fraud (attackers using the public worker URL to bridge international/toll numbers), the `to` parameter is cryptographically signed using HMAC-SHA256:
           `HMAC_SHA256(to, FALLBACK_SIGNING_SECRET) == sig`.
         - **Static Default Fallback**: If `to` or `sig` is omitted or invalid, the worker defaults to a hardcoded emergency operations number or drops the call safely (`<Reject />`).
       - Returns:
         ```xml
         <Response>
           <Dial timeout="30"><Number>+12025550199</Number></Dial>
         </Response>
         ```
    2. **Alternative B (Twilio Serverless Functions & Assets API)**:
       - Twilio provides a programmatic REST API for **Twilio Serverless Functions** (`client.serverless.v1.services(...)`), allowing automated creation, deployment, and updating of Node.js edge functions directly on Twilio's infrastructure.
    3. **Alternative C (Manual Console Provisioning with SID Storage)**:
       - If a business provisions a static TwiML Bin directly inside the Twilio Console during onboarding, the generated SID is stored in `public.twilio_configs.twilio_twiml_bin_sid` and mapped to `IncomingPhoneNumber.voiceFallbackUrl`.
- **Webhook Response-Time Budget (< 1,500ms Ceiling)**:
  - Human callers perceive latency beyond 1.5 seconds as dead air or a dropped line. The system operates under a strict **800ms target / 1,500ms hard ceiling**:
    - **Signature Verification**: < 5ms (`validateRequest` with `TWILIO_AUTH_TOKEN`).
    - **Tenant Configuration Lookup**: < 30ms (indexed B-Tree scan on `twilio_configs.twilio_phone_number`).
    - **Quota Check**: < 10ms (cached usage check via `org_usage_status` or memory fallback).
    - **TwiML Render & Response**: < 5ms.
    - **Asynchronous Telemetry**: Writing initial `call_logs` record is executed in background via `waitUntil()` (Edge / Next.js) so database insert latency NEVER delays returning the initial `<Dial>` verb to Twilio.
- **Route Degradation Matrix on Database Failure**:
  | Webhook Route | Failure Scenario | Degradation Strategy |
  | :--- | :--- | :--- |
  | `/api/incoming-call` | Supabase DB down / unreachable | Catch error, log to Sentry, return static Fail-Open `<Dial>` to primary owner phone. |
  | `/api/incoming-call/action` | DB down on call completion | Route to Vapi SIP endpoint `<Dial><Sip>...` if status is no-answer; log payload to Redis buffer. |
  | `/api/incoming-call/status` | DB down on call summary callback | Write callback payload to Upstash Redis queue for asynchronous DB replay once online. |
  | `/api/vapi/webhook` | DB down on end-of-call report | Return HTTP 200 ack immediately to Vapi; buffer transcript & duration in Redis queue for delayed sync. |

---

### 7. Official Provider Policy, Deprecations & Support Matrix (Audited Oct 2026)

| Provider / Dependency | Version / Feature | Policy / Status (Verified from Official Sources) | Date / Timeline | Architecture Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js** | 15.x -> 16.4.2 | **Next.js Support Policy (`nextjs.org/support-policy`)**: Next 15 Maintenance LTS ends **October 21, 2026**. Next 16 is Active LTS with Turbopack as default bundler and explicit Cache Components (`"use cache"`). | EOL Oct 21, 2026 | `package.json` updated to `next@^16.4.2`; compiles with 0 errors (`tsc --noEmit`). |
| **Gemini (Google AI Studio)** | Free Tier API | **Verified (`ai.google.dev/pricing`)**: Free of charge with rate limits. **Data Policy:** Prompts and responses **may be used to train Google models** and reviewed by humans (except in EEA/UK/CH). | Live Verified | Free tier **strictly forbidden** for customer business review data. Must use Paid or Vertex AI tier. |
| **Gemini (Developer API Paid)** | Paid Pay-As-You-Go | **Verified (`ai.google.dev/pricing`)**: Pay-per-token. **Data Policy:** Google **does NOT train models** on customer prompts or responses. Optional developer logs auto-expire (7-55 days). | Live Verified | Enterprise-ready for automated Google Review drafting with billing enabled. |
| **Twilio Telephony** | TwiML Bins REST API | **Verified (`twilio.com/docs`)**: **No public REST API** exists for TwiML Bins. | Permanent | Decoupled fail-open uses tiny static function on separate host (Cloudflare Worker) or Twilio Serverless Functions. |
| **Twilio A2P 10DLC** | Toll-Free / 10DLC Verification | **Verified (`twilio.com/docs`)**: Total carrier block on unverified numbers effective **January 31, 2024** (Twilio Error 30032). | Effective Jan 31, 2024 | Hard requirement: All tenant outbound SMS routes through approved Campaign SID via `a2p_registrations`. |
| **Netlify Edge** | Credit Billing Model | Netlify computes serverless invocations + edge compute under unified monthly credit budget. | Active | Telephony webhooks respond under 1,500ms to minimize execution duration credit burn. |
| **Cloudflare Workers** | Edge Memory Limit | Standard workers capped at 64MB uncompressed / 128MB. | Active | Fail-open worker uses 0 external dependencies for sub-millisecond execution. |


