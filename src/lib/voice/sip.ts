// Vapi routes SIP calls by the sipUri of a Vapi "phone number" resource (provider "vapi"), not
// by assistant ID. Each organization gets one, at a deterministic address derived from its id,
// so the voice router never needs an extra lookup to know where to dial.
export function vapiSipUsername(organizationId: string): string {
  return `bizcomms-${organizationId}`;
}

export function vapiSipUri(organizationId: string, sipHost: string): string {
  return `sip:${vapiSipUsername(organizationId)}@${sipHost}`;
}

// Sent as SIP X- headers on the INVITE. Vapi exposes `x-<name>` headers as template variables
// (`<name>`), which is why these use underscores. Vapi doesn't document where they appear in
// webhook payloads, so the webhook searches for them and falls back to other correlation.
export const CALL_SID_HEADER = 'X-bizcomms_call_sid';
export const ORG_ID_HEADER = 'X-bizcomms_org_id';
