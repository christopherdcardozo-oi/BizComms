import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';
import { pricing, siteConfig, TEXT_BACK_FORWARDED_MINUTES } from '@/lib/site';

export const metadata = { title: `Terms of Service · ${siteConfig.name}` };

// Comprehensive DRAFT for review by a licensed attorney before launch. Not legal advice.
// Business details come from src/lib/site.ts; keep them accurate.
export default function TermsPage() {
  const { name, legalName, contactEmail, mailingAddress, governingState } = siteConfig;
  const email = (
    <a className="underline" href={`mailto:${contactEmail}`}>
      {contactEmail}
    </a>
  );

  return (
    <LegalPage title="Terms of Service">
      <section className="rounded-xl bg-muted/60 p-5 ring-1 ring-inset ring-border/60">
        <h2>The short version</h2>
        <p>This summary is for convenience and is not part of the Terms. The full Terms below control.</p>
        <ul>
          <li>{name} gives your business a phone number, texts back callers you miss, can answer calls with an AI receptionist, and helps you reply to Google reviews.</li>
          <li>You are responsible for following calling and texting laws for your business, including having the consent you need.</li>
          <li>Plans renew monthly or yearly until you cancel. You can cancel anytime from your billing settings.</li>
          <li>Your business data is yours. We use it only to run the service.</li>
          <li>The service is not for emergencies. AI can make mistakes, so review what matters.</li>
        </ul>
      </section>

      <section>
        <h2>1. Agreement to these Terms</h2>
        <p>
          These Terms of Service (the &ldquo;Terms&rdquo;) are a binding agreement between {legalName} (&ldquo;{name}&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;) and the business that creates an account or uses the Service (&ldquo;Customer&rdquo;, &ldquo;you&rdquo;). By creating an
          account, clicking to accept, or using the Service, you agree to these Terms and to our{' '}
          <Link className="underline" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          If you accept on behalf of a business, you confirm you have authority to bind it. The Service is for business use only. You must be at
          least 18 years old and able to form a binding contract. Consumer-protection laws that cannot be waived still apply where they govern.
        </p>
      </section>

      <section>
        <h2>2. Definitions</h2>
        <ul>
          <li>
            <strong>Service</strong>: the {name} websites, applications, phone numbers, messaging, AI features, integrations, and support.
          </li>
          <li>
            <strong>Customer Data</strong>: information you or your callers and customers provide through the Service, including call records,
            recordings, transcripts, messages, contact details, and review content.
          </li>
          <li>
            <strong>End Users</strong>: people who call, text, or review your business, and anyone you contact through the Service.
          </li>
          <li>
            <strong>Authorized Users</strong>: your employees and contractors you allow to use your account.
          </li>
          <li>
            <strong>Third-Party Services</strong>: services we rely on or connect to, such as telephone carriers, messaging providers, AI model
            providers, Google, and our payment processor.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. The Service</h2>
        <p>Depending on your plan, the Service may include:</p>
        <ul>
          <li>a business phone number that forwards calls to a phone you choose;</li>
          <li>automatic text replies to callers you miss, and a shared inbox for text conversations;</li>
          <li>an AI receptionist that can answer calls, collect caller details, and provide summaries, transcripts, and recordings;</li>
          <li>AI-drafted replies to Google reviews, which can be published automatically or after your approval; and</li>
          <li>a call log, settings, and reporting.</li>
        </ul>
        <p>
          We may improve, change, or discontinue features. If we remove a material feature of your paid plan, we will give you reasonable notice,
          and you may cancel. Features labeled beta, preview, or test are provided as-is and may change or end at any time.
        </p>
      </section>

      <section>
        <h2>4. Accounts and security</h2>
        <ul>
          <li>Provide accurate account and business information and keep it current, including details needed for carrier registration.</li>
          <li>Keep login credentials confidential. You are responsible for activity under your account, including by your Authorized Users.</li>
          <li>Tell us promptly at {contactEmail} if you suspect unauthorized access.</li>
          <li>Owners and admins control settings, billing, publishing, and connected accounts. You decide who gets which role.</li>
        </ul>
      </section>

      <section>
        <h2>5. Your responsibilities for calls and texts</h2>
        <p>
          Calling and texting are regulated, including by the Telephone Consumer Protection Act (TCPA), state telemarketing and texting laws, and
          wireless carrier rules. You are the sender of messages sent on your behalf, and you are responsible for your compliance. In particular:
        </p>
        <ol>
          <li>
            <strong>Consent.</strong> You will have any consent required by law to send each message. The automatic text-back is intended only as
            a reply to someone who just called your business. You will not use the Service to send marketing, promotional, or unsolicited messages.
          </li>
          <li>
            <strong>Disclosure.</strong> You will tell the public, for example on your website, listings, and signage, that callers who miss you may
            receive a text reply from your business number, and that message and data rates may apply.
          </li>
          <li>
            <strong>Opt-outs.</strong> You will honor opt-out requests. The Service processes STOP and similar requests automatically. You will not
            work around them, re-add opted-out numbers without new consent, or text them from another tool using numbers obtained here.
          </li>
          <li>
            <strong>Quiet hours and content.</strong> You will follow any time-of-day limits and content rules that apply to you, and keep message
            templates truthful and identified with your business name.
          </li>
          <li>
            <strong>Carrier registration.</strong> Texting from business numbers in the United States requires carrier registration (A2P 10DLC).
            You authorize us to register your business with carriers and their registry on your behalf, and you confirm the information you give
            for it is true. Texting may be unavailable until registration is approved, and carriers may reject, suspend, or limit it.
          </li>
          <li>
            <strong>Recording.</strong> Some states require everyone on a call to consent to recording. The AI receptionist&rsquo;s greeting
            discloses that calls may be recorded. You will not disable or alter required disclosures and are responsible for complying with recording
            laws where your callers are located.
          </li>
          <li>
            <strong>AI disclosure.</strong> The AI receptionist identifies itself as an automated assistant. You will not configure it to claim to be
            a human.
          </li>
          <li>
            <strong>Not for emergencies.</strong> The Service does not support calls or texts to 911 or other emergency services and must not be
            relied on for emergency communications.
          </li>
        </ol>
        <p>We may suspend messaging or features if we reasonably believe use violates the law, carrier rules, or these Terms.</p>
      </section>

      <section>
        <h2>6. SMS program terms (for people who receive our customers&rsquo; texts)</h2>
        <p>
          Text messages sent through the Service come from the business you contacted. Message frequency varies. Message and data rates may apply.
          Reply STOP to opt out, START to opt back in, or HELP for help. Carriers are not liable for delayed or undelivered messages. Mobile
          information is not shared with third parties for marketing; see the{' '}
          <Link className="underline" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>7. AI features</h2>
        <ul>
          <li>
            AI receptionist responses, summaries, transcripts, sentiment labels, and review replies are generated automatically and can be
            inaccurate or incomplete. Check important details before you act on them.
          </li>
          <li>The AI receptionist does not give legal, medical, financial, or other professional advice, and does not make binding commitments, quotes, or appointments on your behalf.</li>
          <li>
            You control which review replies publish automatically and are responsible for content published under your business name. We design
            replies to avoid offering incentives, admitting fault, or inventing facts, but you remain responsible for reviewing your settings.
          </li>
          <li>
            We use AI providers under terms that do not allow them to train their models on your data. We do not use Customer Data to train our own
            models.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Google Business Profile</h2>
        <p>
          When you connect Google, you authorize us to access your Business Profile to read reviews and publish replies you approve or allow. You
          must have the right to manage that profile and follow Google&rsquo;s policies. You can disconnect at any time from your settings or your
          Google account. Google features depend on Google&rsquo;s approval and availability, which we do not control.
        </p>
      </section>

      <section>
        <h2>9. Acceptable use</h2>
        <p>You will not, and will not let anyone else:</p>
        <ul>
          <li>send spam, robocalls, marketing without consent, or messages to purchased or scraped lists;</li>
          <li>harass, threaten, defraud, or impersonate anyone, or send unlawful, deceptive, or hateful content;</li>
          <li>send content about illegal goods or services, or restricted content that carriers prohibit;</li>
          <li>use the Service to collect sensitive data such as payment card numbers, Social Security numbers, or health records by text;</li>
          <li>interfere with, probe, overload, or bypass the security of the Service, or use it to attack others;</li>
          <li>resell, sublicense, or white-label the Service without a written reseller agreement with us;</li>
          <li>copy, reverse engineer, or build a competing product from the Service, except as law expressly allows; or</li>
          <li>use the Service in violation of any law, regulation, or carrier or Google policy.</li>
        </ul>
      </section>

      <section>
        <h2>10. Phone numbers</h2>
        <ul>
          <li>
            Phone numbers are assigned to your account through our carrier partners. You may use the number while your account is active and in good
            standing; carrier and regulatory rules govern numbers.
          </li>
          <li>
            While your account is active and paid, you may ask to port your number to another provider. We will cooperate within a reasonable time,
            subject to carrier requirements.
          </li>
          <li>
            If your subscription is canceled or unpaid, calls continue to forward for a grace period of at least 30 days, after which your number may
            be released and cannot be recovered. We show the release date in your dashboard.
          </li>
        </ul>
      </section>

      <section>
        <h2>11. Plans, fees, and billing</h2>
        <h3>Subscriptions and automatic renewal</h3>
        <p>
          Paid plans are billed in advance, monthly or yearly, and{' '}
          <strong>renew automatically for the same period at the then-current price until you cancel</strong>. Current plans and prices are shown on
          our{' '}
          <Link className="underline" href="/#pricing">
            pricing page
          </Link>{' '}
          and at checkout. You authorize us and our payment processor to charge your payment method for each renewal.
        </p>
        <h3>Cancellation</h3>
        <p>
          You can cancel anytime from your billing settings, online, without calling us. Cancellation takes effect at the end of the current billing
          period, and you keep access until then.
        </p>
        <h3>Setup fee, trials, and usage</h3>
        <ul>
          <li>
            A one-time setup fee (currently {pricing.currency}
            {pricing.setupFee}) covers carrier registration and is non-refundable once registration is submitted. We may waive it, for example on
            yearly plans.
          </li>
          <li>
            If we offer a free trial, we will tell you at signup when it ends and what you will be charged. Unless you cancel before the trial ends,
            your paid plan starts automatically.
          </li>
          <li>
            Plans include usage allowances, such as AI receptionist minutes. If you go over, we may pause the affected feature until the next billing
            period or offer additional usage at prices shown in the app, and we will not charge for overage you did not agree to.
          </li>
          <li>
            Plans that list forwarded call minutes (for example, up to {TEXT_BACK_FORWARDED_MINUTES} a month on Text-Back) include them as a fair-use
            allowance. We never block, pause, or stop forwarding calls because of it. If you regularly go over, we may contact you about moving to a
            plan that fits your call volume, and we will not charge for extra minutes unless you agree.
          </li>
        </ul>
        <h3>Refunds, price changes, and taxes</h3>
        <ul>
          <li>Fees are non-refundable except where required by law or where we choose to issue a refund or credit.</li>
          <li>We will give you at least 30 days&rsquo; notice of a price increase, which takes effect at your next renewal. You may cancel before it applies.</li>
          <li>Prices exclude taxes. You are responsible for applicable taxes other than taxes on our income.</li>
        </ul>
        <h3>Late or failed payments</h3>
        <p>
          If a payment fails, we will retry and notify you. If it remains unpaid, texting and AI features may be paused; call forwarding continues
          during the grace period in Section 10.
        </p>
      </section>

      <section>
        <h2>12. Your data</h2>
        <ul>
          <li>You own Customer Data. You grant us the rights needed to host, process, transmit, and display it to provide, secure, and support the Service.</li>
          <li>
            We act as your service provider and process Customer Data on your instructions and as described in our Privacy Policy. We do not sell
            Customer Data or use it for advertising.
          </li>
          <li>
            You are responsible for having the right to provide Customer Data to us and for the notices and consents your End Users need.
          </li>
          <li>
            After your account ends, you may request an export for 30 days. We then delete Customer Data within a reasonable period, except where the
            law requires us to keep it or it remains in routine backups until they expire.
          </li>
          <li>We may use aggregated, de-identified data that does not identify you or any person to operate and improve the Service.</li>
        </ul>
      </section>

      <section>
        <h2>13. Confidentiality and security</h2>
        <p>
          Each party will protect the other&rsquo;s non-public information with reasonable care and use it only for this agreement. We maintain
          reasonable administrative, technical, and physical safeguards, including isolating each business&rsquo;s data and encrypting connected
          account credentials. We will notify you without undue delay if we confirm a security breach affecting your Customer Data, as required by
          law.
        </p>
      </section>

      <section>
        <h2>14. Third-party services</h2>
        <p>
          The Service relies on Third-Party Services such as carriers, messaging and voice providers, AI model providers, Google, hosting, and
          payments. Their availability, rules, and changes are outside our control, and they may block, filter, or delay calls and messages. Your use
          of a Third-Party Service you connect is also subject to that provider&rsquo;s terms.
        </p>
      </section>

      <section>
        <h2>15. Intellectual property and feedback</h2>
        <p>
          We and our licensors own the Service and all related intellectual property. We grant you a limited, non-exclusive, non-transferable right
          to use the Service during your subscription under these Terms. If you send us feedback or suggestions, we may use them without obligation
          to you.
        </p>
      </section>

      <section>
        <h2>16. Availability and support</h2>
        <p>
          We aim for high availability and design the Service so calls keep ringing your phone if parts of it fail, but we do not guarantee
          uninterrupted or error-free operation. We may perform maintenance, and we will try to schedule it to minimize disruption. Support is
          available at {email}.
        </p>
      </section>

      <section>
        <h2>17. Disclaimers</h2>
        <p>
          To the fullest extent permitted by law, the Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, and we disclaim all
          warranties, express or implied, including merchantability, fitness for a particular purpose, title, and non-infringement. We do not
          guarantee that every call will be answered, every message delivered, or any particular business result, such as more jobs, revenue, or
          reviews.
        </p>
      </section>

      <section>
        <h2>18. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law: (a) neither party is liable for indirect, incidental, special, consequential, or punitive damages,
          or for lost profits, revenue, business, goodwill, or data; and (b) each party&rsquo;s total liability arising out of or relating to these
          Terms is limited to the amounts you paid us in the 12 months before the event giving rise to the claim.
        </p>
        <p>
          These limits do not apply to your payment obligations, your indemnity obligations, or liability that cannot be limited by law, including
          for fraud or willful misconduct.
        </p>
      </section>

      <section>
        <h2>19. Indemnification</h2>
        <p>
          You will defend, indemnify, and hold us harmless from claims, fines, and costs (including reasonable attorneys&rsquo; fees) arising from:
          messages or calls made on your behalf without required consent or in violation of law; your Customer Data; your content and review replies
          you publish or allow to publish; your violation of these Terms; or your violation of carrier or Google policies.
        </p>
        <p>
          We will defend you against third-party claims that the Service, as provided by us, infringes their intellectual property rights, and pay
          resulting damages finally awarded, except for claims caused by your content, your modifications, or your combination of the Service with
          things we did not provide.
        </p>
      </section>

      <section>
        <h2>20. Suspension and termination</h2>
        <ul>
          <li>You may stop using the Service and cancel at any time as described in Section 11.</li>
          <li>
            We may suspend or terminate your account if you materially breach these Terms and do not cure within 10 days of notice, or immediately if
            needed to prevent harm, legal violations, carrier penalties, or security risks.
          </li>
          <li>
            On termination, your right to use the Service ends, Sections 10, 12, and 17 through 23 survive, and phone numbers are handled as described in
            Section 10.
          </li>
        </ul>
      </section>

      <section>
        <h2>21. Disputes</h2>
        <h3>Informal resolution first</h3>
        <p>
          Before filing a claim, each party agrees to try to resolve the dispute informally for 30 days after written notice to the other, sent to
          the contact details in Section 23 or your account email.
        </p>
        <h3>Binding arbitration and class-action waiver</h3>
        <p>
          If not resolved, disputes will be resolved by binding individual arbitration administered by the American Arbitration Association under its
          Commercial Arbitration Rules, seated in {governingState}, except that either party may bring an individual claim in small-claims court or
          seek injunctive relief for misuse of intellectual property or confidential information. <strong>Claims may be brought only individually,
          not as a plaintiff or class member in any class or representative proceeding.</strong>
        </p>
        <p>
          You may opt out of arbitration within 30 days after first accepting these Terms by emailing {contactEmail} with your name, business name,
          and a statement that you opt out. If arbitration does not apply, claims will be brought in the state or federal courts located in{' '}
          {governingState}, and both parties consent to their jurisdiction.
        </p>
      </section>

      <section>
        <h2>22. Changes to these Terms</h2>
        <p>
          We may update these Terms. For material changes, we will notify you by email or in the app at least 30 days before they take effect, unless
          a change is required sooner by law or to address abuse. Continuing to use the Service after the effective date means you accept the updated
          Terms; if you do not agree, you may cancel before then.
        </p>
      </section>

      <section>
        <h2>23. General</h2>
        <ul>
          <li>
            <strong>Governing law.</strong> These Terms are governed by the laws of the State of {governingState} and applicable U.S. federal law,
            without regard to conflict-of-laws rules.
          </li>
          <li>
            <strong>Notices.</strong> We may send notices to your account email or in the app. Send notices to us at {legalName}, {mailingAddress},
            and {contactEmail}.
          </li>
          <li>
            <strong>Assignment.</strong> You may not assign these Terms without our consent, except to a successor of your business. We may assign
            them in connection with a merger, acquisition, or sale of assets.
          </li>
          <li>
            <strong>Force majeure.</strong> Neither party is liable for delays caused by events beyond reasonable control, including carrier or
            internet outages, natural disasters, and government action.
          </li>
          <li>
            <strong>Independent parties.</strong> The parties are independent contractors. There are no third-party beneficiaries.
          </li>
          <li>
            <strong>Export and sanctions.</strong> You will comply with U.S. export and sanctions laws and will not use the Service from or for a
            sanctioned country or person.
          </li>
          <li>
            <strong>Entire agreement.</strong> These Terms, the Privacy Policy, and any order or plan details you accept are the entire agreement
            about the Service. If any provision is unenforceable, the rest remains in effect. Failure to enforce a provision is not a waiver.
          </li>
          <li>
            <strong>Contact.</strong> {legalName}, {mailingAddress}. Email: {email}.
          </li>
        </ul>
      </section>
    </LegalPage>
  );
}
