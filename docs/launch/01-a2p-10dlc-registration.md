# A2P 10DLC Registration Packet (Twilio)

**Why this blocks launch:** US carriers block business texts from 10-digit numbers that aren't registered (Twilio error 30034/30032). Until a customer's campaign shows **Approved**, the missed-call text-back cannot reach anyone. Approval typically takes from a few days to several weeks, and rejections restart the clock, so get the wording right the first time.

**Everything marked `[FILL IN]` must come from you.** Never let anyone (human or agent) invent these values. A mismatch with IRS or state records is the #1 reason brands get rejected.

> Fees, form field names and vetting rules change. Confirm current pricing and fields in the Twilio Console before paying.

---

## 0. The model you are registering under: you're an ISV

BizComms OS sends texts **on behalf of other businesses** (your customers). Twilio calls that an **ISV / reseller** setup, and it means two layers:

| Layer | Who it represents | How many | When |
|---|---|---|---|
| **Primary Customer Profile** (Trust Hub) | *Your* company (the SaaS) | One, ever | Now |
| **Secondary Customer Profile + Brand + Campaign** | *Each customer business* (the plumber, the dentist…) | One per customer | During each customer's onboarding |

The brand on each campaign must be **the business whose name appears in the text**, not you. That is why `a2p_registrations` in the schema is per-organization.

**This week's goal:** (1) get your Primary Customer Profile approved, and (2) register your **first pilot customer** end-to-end so you learn the process before automating it.

---

## 1. Primary Customer Profile (your company)

Twilio Console → **Trust Hub → Customer Profiles → Create Primary Business Profile**

| Field | Value |
|---|---|
| Legal business name | `[FILL IN — exactly as on IRS EIN letter (CP 575 / 147C)]` |
| Business type | `[FILL IN — LLC / Corporation / Sole Proprietor / Partnership]` |
| EIN | `[FILL IN]` |
| Business industry | Technology |
| Business registration ID type | EIN |
| Website | `[FILL IN — must be live, show the product, and link a privacy policy]` |
| Regions of operation | USA and Canada |
| Business address | `[FILL IN — must match EIN records; no PO boxes]` |
| Authorized representative | `[FILL IN — name, title, email on your company domain, phone]` |

> **Sole proprietor without an EIN?** You can't act as an ISV for other businesses on a sole-proprietor brand. Get an EIN first (free, same day at irs.gov) and preferably form an LLC.

---

## 2. Per-customer registration (do this for your first pilot customer)

### 2a. Secondary Customer Profile + Brand
Same fields as above, but with **the customer's** legal name, EIN, address, website and authorized contact. Collect these during onboarding; Module E's onboarding form should ask for them.

Brand type:
- **Low-Volume Standard**: right for most local businesses (well under 6,000 message segments/day). Cheaper, faster.
- **Standard**: only if a customer will send high volume.

### 2b. Campaign

Twilio Console → **Messaging → Regulatory Compliance → Campaigns → Register**. Attach the campaign to a **Messaging Service** whose sender pool holds the customer's Twilio number.

| Field | Draft value |
|---|---|
| **Use case** | Customer Care |
| **Campaign description** | `[Business name]` uses this number to reply by text to customers who called the business and could not be answered, typically after hours or while staff are on another call. The reply confirms we received their call and asks how we can help. Customers may continue the conversation by text with business staff. Messages are sent only to people who first called this business number; no marketing or promotional content is sent. |
| **Sample message 1** | `Hi, this is [Business name]! We missed your call. How can we help you today? Reply STOP to opt out.` |
| **Sample message 2** | `Thanks for your message! A team member from [Business name] will follow up shortly. Reply STOP to opt out, HELP for help.` |
| **Message flow / How do end users consent?** *(most-rejected field; see §3)* | Customers initiate contact by calling `[Business name]`'s business phone number, `[number]`, which is published on its website and Google Business Profile. The website states: "Call or text us at [number]. If we miss your call, we'll text you back from this number. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help." `[Optional, recommended: The call greeting also says "If we miss you, we'll text you back."]` Only one automated text is sent per missed call. Further messages are sent only in reply to the customer. Privacy policy: `[URL]`. Terms: `[URL]`. |
| **Opt-in keywords** | START, UNSTOP, YES |
| **Opt-in confirmation message** | `[Business name]: You're subscribed to text updates. Msg & data rates may apply. Msg frequency varies. Reply HELP for help, STOP to opt out.` |
| **Opt-out keywords** | STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT |
| **Opt-out message** | `[Business name]: You've been unsubscribed and will receive no further messages. Reply START to resubscribe.` |
| **Help keywords** | HELP, INFO |
| **Help message** | `[Business name]: For help call [business phone] or visit [website]. Msg & data rates may apply. Reply STOP to opt out.` |
| Embedded links | No |
| Embedded phone numbers | Yes (the business's own number, in HELP replies) |
| Age-gated content | No |
| Direct lending / loan arrangement | No |
| Affiliate marketing | No |

---

## 3. The consent risk: read this before you submit

Carriers increasingly reject or later suspend "missed-call text-back" campaigns when consent isn't clearly disclosed. A phone call alone is weak evidence that someone agreed to receive texts. To strengthen the campaign:

1. **Publish the disclosure** (the quoted sentence in the Message-flow field) on the customer's website near their phone number, and ideally in their Google Business Profile description. Reviewers check the URL.
2. **Consider a pre-ring announcement** ("Thanks for calling [Business]. If we miss you, we'll text you back.") before the `<Dial>`. It costs about 3 seconds of the caller's time but is the strongest evidence of disclosure. Module A doesn't do this yet; it's a small change if you want it.
3. **Send exactly one automated text per missed call.** Module A already enforces this, and every first message includes "Reply STOP to opt out."
4. **Module C (STOP/HELP handling) must be live before real traffic.** The campaign promises those keyword replies.
5. **Have a lawyer review** your Terms, Privacy Policy and this consent flow. TCPA statutory damages are $500–$1,500 per message.

---

## 4. After approval: record it in BizComms OS

Module A refuses to send rescue texts unless the organization's A2P row is approved. Insert or update (service role / SQL editor):

```sql
INSERT INTO public.a2p_registrations (organization_id, brand_sid, campaign_sid, messaging_service_sid, status)
VALUES ('[org uuid]', '[BNxxxxxxxx]', '[CMxxxxxxxx]', '[MGxxxxxxxx]', 'approved')
ON CONFLICT (organization_id) DO UPDATE
SET brand_sid = EXCLUDED.brand_sid,
    campaign_sid = EXCLUDED.campaign_sid,
    messaging_service_sid = EXCLUDED.messaging_service_sid,
    status = 'approved';
```

Later, automate this through Twilio's Trust Hub / Brand Registration / Campaign APIs as part of onboarding (Module E).
