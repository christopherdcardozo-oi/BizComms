import { LegalPage } from '@/components/marketing/legal-page';
import { siteConfig } from '@/lib/site';

export const metadata = { title: `Privacy Policy · ${siteConfig.name}` };

// Draft for review by a lawyer before launch; not legal advice.
export default function PrivacyPage() {
  const { name, legalName, contactEmail, mailingAddress } = siteConfig;
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <h2>Who we are</h2>
        <p>
          {name} is operated by {legalName}. We provide communication tools to local businesses (our &ldquo;Customers&rdquo;). When you call or text a
          business that uses {name}, we process your information on that business&rsquo;s behalf.
        </p>
      </section>
      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>Business account information: name, email, business details, and billing information (processed by our payment provider; we do not store card numbers).</li>
          <li>Caller and texter information: phone numbers, call times and durations, text messages, and opt-out status.</li>
          <li>AI receptionist calls: call recordings, transcripts, and AI-generated summaries.</li>
          <li>Google reviews: public review content and the replies drafted or published, when a business connects its Google Business Profile.</li>
          <li>Technical data: basic logs needed to operate and secure the Service.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>
          Only to provide the Service: routing calls, sending replies the business has configured, showing conversations in the business&rsquo;s
          dashboard, drafting review replies, billing, security, and legal compliance. We do not sell personal information.
        </p>
      </section>
      <section>
        <h2>Text messaging</h2>
        <p>
          Missed-call text replies are sent on behalf of the business you contacted. Message frequency varies. Message and data rates may apply.
          Reply STOP to opt out at any time, or HELP for help. Carriers are not liable for delayed or undelivered messages.
        </p>
        <p>
          No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. All the above categories
          exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
        </p>
      </section>
      <section>
        <h2>Service providers</h2>
        <p>We share information only with providers that help us run the Service, under contracts that limit their use of it:</p>
        <ul>
          <li>Telephony and messaging (e.g. Twilio)</li>
          <li>AI voice and language models (e.g. Vapi, OpenAI or Google), on paid tiers that do not train on your data</li>
          <li>Database hosting (Supabase), application hosting, and payments (Stripe)</li>
          <li>Google, when a business connects its Business Profile</li>
        </ul>
      </section>
      <section>
        <h2>Security and retention</h2>
        <p>
          Each business&rsquo;s data is isolated from other businesses, connections are encrypted in transit, and connected Google credentials are
          encrypted at rest. We keep data while the business&rsquo;s account is active and delete it within a reasonable period after the account
          closes, unless the law requires us to keep it longer.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>
          Reply STOP to any text to stop receiving them. To access or delete information a business holds about you, contact that business or us.
          Business customers can export or delete their data by contacting us.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          {legalName}, {mailingAddress}. Email: <a className="underline underline-offset-4" href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </section>
    </LegalPage>
  );
}
