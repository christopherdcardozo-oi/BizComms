// Owner texting command center: lead alerts texted to the owner's own phone, and the replies they
// text back ("1" to call the lead, "won 650", ...). The owner is the line's forward_to_number.

export type AlertKind = 'missed_call' | 'ai_call' | 'text' | 'digest';

export interface AlertClaim {
  organizationId: string;
  kind: AlertKind;
  // At-most-once key per organization, e.g. 'call:<CallSid>' or 'digest:2026-10-22'.
  dedupeKey: string;
  contactNumber: string | null;
  callSid: string | null;
  urgent: boolean;
}

export interface LatestLead {
  kind: AlertKind;
  contactNumber: string;
  callSid: string | null;
  urgent: boolean;
}

export interface OwnerStore {
  // True when this alert is new (and now recorded); false when it was already sent.
  claimAlert(claim: AlertClaim): Promise<boolean>;
  // Most recent lead alert (not a digest) since the given time, or null.
  latestLead(organizationId: string, sinceIso: string): Promise<LatestLead | null>;
  recordJobWon(input: { organizationId: string; contactNumber: string | null; callSid: string | null; amountCents: number | null }): Promise<void>;
  recoveredCents(organizationId: string, sinceIso: string): Promise<number>;
}

// Rings the owner's cell from the business number, then connects them to the customer with the
// business number as caller ID, so the customer never sees the owner's personal number.
export interface OwnerCaller {
  bridge(input: { ownerNumber: string; customerNumber: string; businessNumber: string; announce: string }): Promise<void>;
}

export interface OwnerDeps {
  store: OwnerStore;
  caller: OwnerCaller;
}
