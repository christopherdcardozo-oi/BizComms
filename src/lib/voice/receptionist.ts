import { parseBusinessProfile, receptionistContext } from '../business-profile';
import type { IVoiceAiProvider } from '../providers/voice-ai/types';
import type { BusinessHours } from '../telephony/business-hours';
import { vapiSipUri } from './sip';

export function receptionistGreeting(businessName: string): string {
  // AI + recording disclosure up front: several states require one or both.
  return `Thanks for calling ${businessName}. You've reached our automated assistant, and this call may be recorded. How can I help you today?`;
}

// businessContext: facts from the business profile (services, area, hours…), one per line.
// Spoken last on every call; Vapi hangs up as soon as the assistant says it (endCallPhrases),
// so calls end the moment the job is captured instead of idling until the caller hangs up.
export const RECEPTIONIST_CLOSING = 'Thanks for calling, someone will be in touch soon. Goodbye.';

// The end-of-call summary is texted to the owner, so it must read well on a phone, and it starts
// with "URGENT:" for urgent calls (owner/alerts.ts flags those).
export function receptionistSummaryPrompt(businessUrgent?: string): string {
  const extra = businessUrgent?.trim() ? ` This business also treats these as urgent: ${businessUrgent.trim()}` : '';
  return [
    'You summarize phone calls for a busy tradesperson who will read this as a text message.',
    'In one or two short sentences, give the caller name, callback number, job address, and the problem, using only what was said on the call.',
    'If the call is urgent (an active leak or flooding, no heat in freezing weather, no cooling in extreme heat, a gas smell, smoke, sparking or burning, a sewage backup, someone trapped, or the caller says it is an emergency), start the summary with "URGENT: ".' +
      extra,
    'Otherwise never use the word urgent.',
  ].join(' ');
}

export function receptionistPrompt(businessName: string, ownerInstructions: string | null, businessContext: string[] = []): string {
  return [
    `You are the phone receptionist for ${businessName}, a local service business.`,
    ...businessContext,
    ownerInstructions?.trim() || 'Be warm, courteous, and efficient.',
    "Collect the caller's name, the best callback number, and what they need help with, then confirm the details back.",
    'Tell the caller someone from the business will follow up soon.',
    'Never quote prices, promise appointment times, or give technical, medical, or legal advice.',
    'If the caller describes an emergency involving danger to people (for example a gas smell, smoke, or sparking wires), tell them to get somewhere safe and call 911.',
    'Keep responses short; this is a phone call. Ask one question at a time.',
    `After you read the details back once and the caller confirms, say exactly: "${RECEPTIONIST_CLOSING}" and nothing else.`,
  ].join('\n');
}

export interface ReceptionistStore {
  getOrganization(organizationId: string): Promise<{
    name: string;
    aiReceptionistPrompt: string | null;
    vapiAssistantId: string | null;
    vapiPhoneNumberId: string | null;
    businessProfile?: unknown;
    businessHours?: BusinessHours | null;
    timezone?: string;
  } | null>;
  saveVapiIds(organizationId: string, ids: { assistantId: string; phoneNumberId: string }): Promise<void>;
}

// Creates (or refreshes) the org's Vapi assistant and its SIP phone number, then records the
// ids server-side. Idempotent: existing ids are updated in place, never duplicated.
export async function provisionReceptionist(
  organizationId: string,
  deps: { provider: IVoiceAiProvider; store: ReceptionistStore; sipHost: string; webhookUrl: string }
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'provider_failed' }> {
  const org = await deps.store.getOrganization(organizationId);
  if (!org) return { ok: false, error: 'not_found' };

  let ids: { assistantId: string; phoneNumberId: string };
  try {
    ids = await deps.provider.upsertReceptionist(
      {
        organizationId,
        businessName: org.name,
        systemPrompt: receptionistPrompt(
          org.name,
          org.aiReceptionistPrompt,
          receptionistContext(parseBusinessProfile(org.businessProfile), org.businessHours, org.timezone)
        ),
        firstMessage: receptionistGreeting(org.name),
        sipUri: vapiSipUri(organizationId, deps.sipHost),
        webhookUrl: deps.webhookUrl,
        summaryPrompt: receptionistSummaryPrompt(parseBusinessProfile(org.businessProfile).emergencies),
      },
      { assistantId: org.vapiAssistantId, phoneNumberId: org.vapiPhoneNumberId }
    );
  } catch {
    return { ok: false, error: 'provider_failed' };
  }
  await deps.store.saveVapiIds(organizationId, ids);
  return { ok: true };
}
