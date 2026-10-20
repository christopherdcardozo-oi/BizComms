import { getTelephonyProvider } from '../src/lib/providers/telephony';
import { getSmsProvider } from '../src/lib/providers/sms';
import { getVoiceAiProvider } from '../src/lib/providers/voice-ai';
import { getLlmProvider } from '../src/lib/providers/llm';
import { getReviewsProvider } from '../src/lib/providers/reviews';
import { getBillingProvider } from '../src/lib/providers/billing';
import { UsageGuard } from '../src/lib/billing/usage-guard';

// The simulator always runs against mocks; providers read these flags lazily at call time.
process.env.USE_MOCK_TELEPHONY ??= 'true';
process.env.USE_MOCK_SMS ??= 'true';

async function main() {
  console.log('--- BizComms OS: Local Simulation Script ---');

  // 1. Telephony Provider
  const telephony = getTelephonyProvider();
  const twimlForward = telephony.buildForwardTwiML({
    forwardToNumber: '+12025550199',
    ringTimeoutSeconds: 15,
    actionUrl: 'https://api.bizcomms.example/api/incoming-call/action',
  });
  console.log('✓ Telephony TwiML Forward generated:');
  console.log(twimlForward);

  const failOpenTwiML = telephony.buildFailOpenTwiML('+12025550199');
  console.log('✓ Telephony Fail-Open TwiML generated:');
  console.log(failOpenTwiML);

  // 2. SMS Provider (Missed call auto-reply)
  const sms = getSmsProvider();
  const smsResult = await sms.sendSms({
    from: '+12025550101',
    to: '+12025550123',
    body: 'Hi! Sorry we missed your call at Acme Plumbing. How can we help you today?',
  });
  console.log('✓ Missed-call SMS dispatched:', smsResult);

  // 3. Voice AI Provider
  const voiceAi = getVoiceAiProvider();
  const astResult = await voiceAi.createOrUpdateAssistant({
    name: 'Acme Receptionist',
    systemPrompt: 'You are the receptionist for Acme Plumbing. Be polite, concise, and helpful.',
  });
  console.log('✓ Voice AI Assistant configured:', astResult);

  // 4. LLM Provider (Google Review Reply Generation)
  const llm = getLlmProvider();
  const reviewReply = await llm.generateReviewReply({
    businessName: 'Acme Plumbing',
    reviewerName: 'Alice Walker',
    starRating: 5,
    reviewComment: 'Prompt, professional, and fixed our leak in under an hour!',
  });
  console.log('✓ LLM Review Reply generated:', reviewReply);

  // 5. Google Reviews Provider
  const reviews = getReviewsProvider();
  const reviewList = await reviews.listReviews('locations/loc-123', 'mock-token');
  console.log(`✓ Fetched ${reviewList.length} reviews from Google Business Profile.`);

  // 6. Billing & Usage Guard
  const billing = getBillingProvider();
  const cust = await billing.createCustomer({
    organizationId: 'org-test-123',
    name: 'Acme Plumbing',
    email: 'owner@acmeplumbing.com',
  });
  console.log('✓ Billing Customer created:', cust);

  const quotaCheck = UsageGuard.checkVoiceQuota(120, 150);
  console.log('✓ Quota check passed:', quotaCheck);

  console.log('\n--- Simulation Completed Successfully! ---');
}

main().catch((err) => {
  console.error('Simulation error:', err);
  process.exit(1);
});
