import type { INumberProvisioningProvider, NumberWebhooks } from '../providers/numbers/types';
import { NANP_E164 } from './phone';

export interface LineStore {
  organizationHasLine(organizationId: string): Promise<boolean>;
  insertPrimaryLine(input: {
    organizationId: string;
    twilioPhoneNumber: string;
    twilioPhoneSid: string;
    forwardToNumber: string;
  }): Promise<void>;
}

export type ProvisionResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; error: 'invalid_number' | 'invalid_forward_number' | 'already_has_number' | 'purchase_failed' | 'save_failed' };

// Buys a number on the platform's Twilio account, points its webhooks at us, and records it.
// MVP cap: one number per organization (also enforced by the one-primary-per-org unique index,
// which is what catches two purchases racing). If the DB write fails after a successful
// purchase, the number is released immediately so we never pay for an orphan.
export async function provisionNumber(
  input: { organizationId: string; phoneNumber: string; forwardToNumber: string },
  deps: {
    provider: INumberProvisioningProvider;
    store: LineStore;
    webhooks: (forwardToNumber: string) => NumberWebhooks;
    logger: { error(message: string, context?: Record<string, unknown>): void };
  }
): Promise<ProvisionResult> {
  if (!NANP_E164.test(input.phoneNumber)) return { ok: false, error: 'invalid_number' };
  if (!NANP_E164.test(input.forwardToNumber)) return { ok: false, error: 'invalid_forward_number' };
  if (input.forwardToNumber === input.phoneNumber) return { ok: false, error: 'invalid_forward_number' };
  if (await deps.store.organizationHasLine(input.organizationId)) return { ok: false, error: 'already_has_number' };

  let purchased: { sid: string; phoneNumber: string };
  try {
    purchased = await deps.provider.purchase(input.phoneNumber, deps.webhooks(input.forwardToNumber));
  } catch (err) {
    deps.logger.error('Number purchase failed', { organizationId: input.organizationId, error: String(err) });
    return { ok: false, error: 'purchase_failed' };
  }

  try {
    await deps.store.insertPrimaryLine({
      organizationId: input.organizationId,
      twilioPhoneNumber: purchased.phoneNumber,
      twilioPhoneSid: purchased.sid,
      forwardToNumber: input.forwardToNumber,
    });
  } catch (err) {
    deps.logger.error('Saving purchased number failed; releasing it', { sid: purchased.sid, error: String(err) });
    try {
      await deps.provider.release(purchased.sid);
    } catch (releaseErr) {
      deps.logger.error('RELEASE FAILED: orphaned Twilio number is still billing', { sid: purchased.sid, error: String(releaseErr) });
    }
    return { ok: false, error: 'save_failed' };
  }

  return { ok: true, phoneNumber: purchased.phoneNumber };
}
