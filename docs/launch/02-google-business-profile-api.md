# Google Business Profile API Access Packet

**Why this blocks launch:** new Google Cloud projects start with a **quota of 0** for the Business Profile APIs. Until Google approves your access request you can't read or reply to a single review, so Module D runs on mocks only. This approval, and the OAuth verification in step 4, can each take weeks. Start both now.

> Google changes these requirements and form URLs often. Confirm each prerequisite on the official "Business Profile APIs → Prerequisites / Request access" page before submitting.

**Everything marked `[FILL IN]` must come from you.**

---

## 1. Prerequisites (commonly enforced; check that each is true first)

- [ ] **A verified Google Business Profile that you manage**, typically required to be **active for 60+ days**. If your own SaaS company doesn't have one, use a real business you legitimately manage (for example your first pilot customer, with their written permission, added as a manager).
- [ ] **A live website** for your company, listed on that Business Profile.
- [ ] **An email on your company's domain** (not gmail.com) as the requester and the Cloud project owner.
- [ ] **Privacy Policy and Terms of Service** live on that website.

## 2. Google Cloud project

1. console.cloud.google.com → create project **`bizcomms-os-prod`** under your company account.
2. Note the **Project number** (the form asks for it).
3. **APIs & Services → Library**, then enable:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API (v4: reviews live here; `PUT …/reviews/{id}/reply`)

## 3. Access request form

Search "Business Profile API access request" in Google's Business Profile developer docs to find the current form. Draft answers:

| Field | Draft answer |
|---|---|
| Company name | `[FILL IN]` |
| Company website | `[FILL IN]` |
| Contact email (company domain) | `[FILL IN]` |
| Google Cloud project number | `[FILL IN]` |
| Business Profile you manage (name / URL) | `[FILL IN]` |
| Are you a business owner or a third party managing on behalf of businesses? | Third party: a software platform used by local service businesses to manage their own profiles |
| Approx. number of locations | `[FILL IN — e.g. "Under 50 in the first 6 months"]` |
| **Use case description** | BizComms OS is a communications platform for local service businesses (plumbers, HVAC, clinics). With the business owner's explicit OAuth consent (`business.manage` scope), we read new reviews on locations the owner manages and help them respond. Our software drafts a reply with an AI model. Positive reviews may be auto-published if the owner enables it; negative or neutral reviews are held for the owner's approval before publishing. We only access locations the authenticated owner manages, never post content other than review replies, never create or modify listings, and never use review data to train AI models (we use paid AI API tiers with no-training terms). Owners can disconnect at any time, which revokes and deletes stored tokens. |
| APIs needed | Account Management, Business Information, v4 reviews (list reviews, update/delete reply) |

## 4. OAuth consent screen + app verification (separate review, also slow)

`business.manage` is a **sensitive scope**. In production, an unverified app shows a scary warning and has a 100-user cap.

1. **APIs & Services → OAuth consent screen**: User type **External**.
2. App name `[FILL IN]`, support email, logo, **homepage URL**, **privacy policy URL**, **terms URL**, authorized domain `[FILL IN]`.
3. Scope: `https://www.googleapis.com/auth/business.manage`.
4. Scope justification: *"Required to list reviews on locations the signed-in owner manages and to publish their approved replies via accounts.locations.reviews.updateReply."*
5. **Demo video** (unlisted YouTube): shows the Google sign-in, the consent screen with the scope, and the review list and approve-reply flow in your dashboard. **This needs the Module D + E UI to exist**, so submit the access form (step 3) now and the verification once the dashboard is built.
6. Redirect URI: `https://[your domain]/api/auth/google/callback` (matches `GOOGLE_REDIRECT_URI` in `.env.local.example`).

## 5. After approval

- Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in production env (never `NEXT_PUBLIC_`).
- Set `USE_MOCK_GOOGLE_REVIEWS="false"` only after the real provider is implemented (Module D).
