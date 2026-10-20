import { LegalPage } from '@/components/marketing/legal-page';
import { siteConfig } from '@/lib/site';

export const metadata = { title: `Terms of Service · ${siteConfig.name}` };

// Draft for review by a lawyer before launch; not legal advice.
export default function TermsPage() {
  const { name, legalName, contactEmail, mailingAddress, governingState } = siteConfig;
  return (
    <LegalPage title="Terms of Service">
      <section>
        <h2>1. Agreement</h2>
        <p>
          These Terms govern your use of {name} (the &ldquo;Service&rdquo;), provided by {legalName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an
          account or using the Service on behalf of a business (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;), you agree to these Terms and confirm you are
          authorized to bind that business.
        </p>
      </section>
      <section>
        <h2>2. The Service</h2>
        <p>
          The Service provides a business phone number with call forwarding, automated text replies to missed callers, a shared text inbox, an
          AI phone receptionist, and AI-drafted replies to Google reviews. Features depend on your plan and on third-party providers such as
          telephone carriers, Google, and AI model providers.
        </p>
      </section>
      <section>
        <h2>3. Your responsibilities for calls and texts</h2>
        <ul>
          <li>You are responsible for having any consent required by law (including the Telephone Consumer Protection Act and state laws) to text people who call your business.</li>
          <li>You will clearly disclose to callers, for example on your website and listings, that missed calls may receive a text reply.</li>
          <li>You will not use the Service for marketing texts, cold outreach, or messages to people who have not contacted your business.</li>
          <li>You will provide accurate business information for carrier registration (A2P 10DLC) and keep it current.</li>
          <li>You will not use the Service for unlawful, harassing, deceptive, or emergency-services purposes. The Service is not a substitute for 911.</li>
        </ul>
      </section>
      <section>
        <h2>4. AI features</h2>
        <p>
          AI receptionist conversations and review replies are generated automatically and may contain mistakes. The AI receptionist identifies
          itself as an automated assistant and discloses that calls may be recorded. You are responsible for reviewing replies you choose to
          publish and for the auto-publish settings you select.
        </p>
      </section>
      <section>
        <h2>5. Fees and billing</h2>
        <p>
          Paid plans are billed in advance through our payment processor and renew automatically until canceled. You can cancel at any time from
          your billing settings; cancellation takes effect at the end of the current billing period. If your subscription lapses, texting and AI
          features pause; call forwarding continues for a limited time, after which your business number may be released.
        </p>
      </section>
      <section>
        <h2>6. Your data</h2>
        <p>
          You own your business data, including call logs, messages, and review replies. We process it only to provide the Service, as described
          in our Privacy Policy. You can request export or deletion by contacting us.
        </p>
      </section>
      <section>
        <h2>7. Availability</h2>
        <p>
          We work to keep the Service reliable, including fallbacks that keep calls ringing your phone, but we do not guarantee uninterrupted
          operation. Carrier, Google, or AI-provider outages and policy changes may affect features.
        </p>
      </section>
      <section>
        <h2>8. Disclaimers and limitation of liability</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; to the fullest extent permitted by law. We are not liable for lost profits, lost business, or
          indirect damages. Our total liability for any claim is limited to the fees you paid in the three months before the claim arose.
        </p>
      </section>
      <section>
        <h2>9. Indemnity</h2>
        <p>
          You will defend and indemnify us against claims arising from messages sent on your behalf where you lacked required consent, or from
          your violation of these Terms or applicable law.
        </p>
      </section>
      <section>
        <h2>10. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate accounts that violate these Terms, carrier requirements, or the
          law, or that put other customers or the Service at risk.
        </p>
      </section>
      <section>
        <h2>11. Changes and governing law</h2>
        <p>
          We may update these Terms and will notify you of material changes. These Terms are governed by the laws of the State of {governingState},
          without regard to conflict-of-laws rules.
        </p>
      </section>
      <section>
        <h2>12. Contact</h2>
        <p>
          {legalName}, {mailingAddress}. Email: <a className="underline underline-offset-4" href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </section>
    </LegalPage>
  );
}
