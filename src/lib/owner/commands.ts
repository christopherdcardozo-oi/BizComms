// Replies the owner texts to their business number. They act on the most recent lead alert.
//   1 / call        ring the owner's phone, then connect them to the lead (business caller ID)
//   2               text the lead: "we'll call you back shortly"
//   won 650 / done  record a won job (amount optional) for the "money recovered" total
//   ? / menu        list the options
// STOP/START/HELP never reach here: they are compliance keywords and handled before this.
import { formatNanp } from '../numbers/phone';
import { sendManualReply } from '../sms/outbound';
import type { LineConfig, TelephonyDeps } from '../telephony/types';

export type OwnerCommand =
  | { type: 'call' }
  | { type: 'quick_reply' }
  | { type: 'won'; amountCents: number | null }
  | { type: 'menu' }
  | { type: 'unknown' };

export function parseOwnerCommand(body: string): OwnerCommand {
  const text = body.trim().toLowerCase();
  if (text === '1' || text === 'call') return { type: 'call' };
  if (text === '2') return { type: 'quick_reply' };
  if (text === '?' || text === 'menu' || text === 'options' || text === 'commands') return { type: 'menu' };
  const won = /^(won|done|sold)\b\s*\$?\s*([\d,]*\.?\d*)\s*$/.exec(text);
  if (won) {
    const digits = won[2].replace(/,/g, '');
    const amount = digits ? Number(digits) : NaN;
    return { type: 'won', amountCents: Number.isFinite(amount) && amount > 0 && amount <= 1_000_000 ? Math.round(amount * 100) : null };
  }
  return { type: 'unknown' };
}

export const OWNER_MENU =
  'Reply to a lead alert with: 1 = call them now, 2 = text them that you will call shortly, "won 650" = log a won job ($ optional). STOP turns off these texts.';

const LEAD_WINDOW_MS = 48 * 60 * 60 * 1000;

export function quickReplyText(businessName: string): string {
  return `Hi, this is ${businessName}. Thanks for reaching out, we'll call you back shortly.`;
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// Runs a command and returns the text to send back to the owner. Never throws.
export async function handleOwnerCommand(line: LineConfig, body: string, deps: TelephonyDeps): Promise<string> {
  const owner = deps.owner;
  if (!owner) return OWNER_MENU;
  const command = parseOwnerCommand(body);
  if (command.type === 'menu') return OWNER_MENU;
  if (command.type === 'unknown') return `Didn't catch that. ${OWNER_MENU}`;

  try {
    const now = deps.now();
    const lead = await owner.store.latestLead(line.organizationId, new Date(now.getTime() - LEAD_WINDOW_MS).toISOString());
    if (!lead && command.type !== 'won') return 'No new leads in the last 2 days to act on.';
    const who = lead ? formatNanp(lead.contactNumber) : '';

    if (command.type === 'call') {
      await owner.caller.bridge({
        ownerNumber: line.forwardToNumber,
        customerNumber: lead!.contactNumber,
        businessNumber: line.twilioPhoneNumber,
        announce: `Connecting you to ${who}.`,
      });
      return `Calling you now to connect you with ${who}. Pick up to be put through.`;
    }

    if (command.type === 'quick_reply') {
      const result = await sendManualReply(
        {
          organizationId: line.organizationId,
          fromNumber: line.twilioPhoneNumber,
          to: lead!.contactNumber,
          body: quickReplyText(line.businessName),
          subscriptionStatus: line.subscriptionStatus,
        },
        deps
      );
      if (result.ok) return `Texted ${who}: "we'll call you back shortly."`;
      return result.error === 'opted_out' ? `${who} has opted out of texts, so we can't text them. Reply 1 to call instead.` : `Couldn't text ${who} right now. Reply 1 to call instead.`;
    }

    // won
    await owner.store.recordJobWon({
      organizationId: line.organizationId,
      contactNumber: lead?.contactNumber ?? null,
      callSid: lead?.callSid ?? null,
      amountCents: command.amountCents,
    });
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const total = await owner.store.recoveredCents(line.organizationId, monthStart);
    const what = command.amountCents ? `${dollars(command.amountCents)} job` : 'won job';
    return `Logged a ${what}${lead ? ` from ${who}` : ''}. Recovered this month: ${dollars(total)}.`;
  } catch (err) {
    deps.logger.error('Owner command failed', { organizationId: line.organizationId, command: command.type, error: String(err) });
    return 'Something went wrong on our end. Please try again in a minute.';
  }
}
