# Set up a Supabase test project (for the end-to-end test)

Use a **separate test project**, not the one you'll run customers on. The E2E test creates
a throwaway business and deletes it afterwards, but it does write real rows.

1. **Create the project.** supabase.com → New project. Name it `bizcomms-test`, pick a US
   region, and save the database password somewhere safe (password manager).
2. **Copy the API keys.** Project Settings → API:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
3. **Copy the database URI.** Project Settings → Database → Connection string → **URI**,
   *Session pooler*. Replace `[YOUR-PASSWORD]` with the database password → `DATABASE_URL`.
4. **Create `.env.local`** in the project folder (it's git-ignored):
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in the four values above. **Don't paste keys into chat**; they only need to be in this file.
5. **Apply the schema** (all migrations, in order, each in a transaction):
   ```bash
   npm run db:migrate
   ```
6. **Run the end-to-end test** (stop any other `next dev` in this folder first):
   ```bash
   npm run test:e2e
   ```

What the E2E test covers: forged-signature rejection, unknown numbers, answered calls with
status callbacks and dedupe, missed-call text-back (exactly once), caller hang-ups, STOP opt-out
blocking the next text, out-of-order callbacks, and SMS usage metering — all through the real
server, real Twilio signature checks and the real Supabase data layer. Texts are recorded but
not sent (mock SMS), and no real phone call is placed.
