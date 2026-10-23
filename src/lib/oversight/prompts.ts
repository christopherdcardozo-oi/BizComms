// The exact instructions each AI works from, rebuilt the same way the server builds them, so the
// oversight page shows what the AI is really told (not a paraphrase).
import type { PromptBlock } from '@/components/dashboard/ai-views';
import { receptionistContext, reviewContext, type BusinessProfile } from '../business-profile';
import { reviewReplyPrompt } from '../providers/llm/prompt';
import type { BusinessHours } from '../telephony/business-hours';
import { renderRescueSms } from '../telephony/rescue-sms';
import { RECEPTIONIST_CLOSING, receptionistGreeting, receptionistPrompt, receptionistSummaryPrompt } from '../voice/receptionist';

export function buildPromptBlocks(input: {
  businessName: string;
  ownerInstructions: string | null;
  profile: BusinessProfile;
  hours: BusinessHours | null;
  timezone: string;
  textBackTemplate: string | null;
  review: { tone: string | null; customInstructions: string | null } | null;
}): PromptBlock[] {
  const blocks: PromptBlock[] = [
    {
      title: 'AI receptionist: instructions',
      description: 'Your business details, then the built-in rules',
      body: receptionistPrompt(input.businessName, input.ownerInstructions, receptionistContext(input.profile, input.hours, input.timezone)),
    },
    {
      title: 'AI receptionist: what callers hear',
      description: 'The first and last thing it says',
      body: `Greeting: ${receptionistGreeting(input.businessName)}\n\nClosing (it hangs up after saying this): ${RECEPTIONIST_CLOSING}`,
    },
    {
      title: 'AI receptionist: call summary',
      description: 'How the summary texted to you is written',
      body: receptionistSummaryPrompt(input.profile.emergencies),
    },
  ];
  if (input.textBackTemplate) {
    blocks.push({ title: 'Missed-call text-back', description: 'Not AI: your fixed message', body: renderRescueSms(input.textBackTemplate, input.businessName) });
  }
  if (input.review) {
    blocks.push({
      title: 'Google review replies: instructions',
      description: 'Sent with each review the AI answers',
      body: reviewReplyPrompt({
        businessName: input.businessName,
        reviewerName: '(reviewer)',
        starRating: 5,
        tone: input.review.tone ?? undefined,
        customInstructions: input.review.customInstructions,
        businessContext: reviewContext(input.profile),
      }).system,
    });
  }
  return blocks;
}
