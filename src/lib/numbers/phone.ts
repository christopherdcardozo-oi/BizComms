import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const NANP_E164 = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

// Accepts how people actually type US/Canada numbers ("(312) 555-0123", "312.555.0123",
// "+1 312 555 0123") and returns E.164, or null if it isn't a dialable NANP number.
export function normalizeNanpNumber(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), 'US');
  if (!parsed || !parsed.isValid()) return null;
  const e164 = parsed.number;
  return NANP_E164.test(e164) ? e164 : null;
}

export function formatNanp(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
