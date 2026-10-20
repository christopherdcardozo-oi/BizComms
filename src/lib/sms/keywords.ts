// Inbound SMS intent classification for TCPA / CTIA compliance (DESIGN_NOTES §5).

export type SmsIntent = 'opt_out' | 'opt_in' | 'help' | 'message';

// keyword:  the whole message is a standard keyword. Twilio's Opt-Out Management also matches
//           these and auto-replies, unless SMS_KEYWORD_REPLIES=app.
// phrase:   plain-language revocation ("stop texting me"). Twilio does NOT match these, but the
//           FCC's 2024 consent-revocation order (in effect since April 2025) requires honoring
//           revocation "by any reasonable means", so the app records it and confirms itself.
// carrier:  Twilio told us via the OptOutType parameter (Advanced Opt-Out).
export type IntentSource = 'keyword' | 'phrase' | 'carrier' | 'none';

const OPT_OUT_KEYWORDS = new Set(['STOP', 'STOPALL', 'STOP ALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'OPT OUT', 'REVOKE']);
const OPT_IN_KEYWORDS = new Set(['START', 'UNSTOP', 'YES']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

// Deliberately broad: wrongly opting someone out costs one conversation; wrongly ignoring a
// revocation costs $500-$1,500 per later message.
const REVOCATION_PHRASES: RegExp[] = [
  /\b(stop|quit|cease)\s+(texting|messaging|sending|contacting|txting)\b/i,
  /\b(don'?t|do not|dont|never)\s+(text|txt|message|msg|contact)\s+(me|this number)\b/i,
  /\bno more\s+(texts|text messages|messages|msgs)\b/i,
  /\b(remove|delete)\s+(me|my number)\b/i,
  /\btake me off\b/i,
  /\bunsubscribe\b/i,
  /\bopt[\s-]?(me\s+)?out\b/i,
  /\bleave me alone\b/i,
  /\bwrong number\b/i,
];

function normalize(body: string): string {
  // Carriers and Twilio match keywords on the whole message, case-insensitive and trimmed.
  // Also tolerate surrounding punctuation/emoji ("Stop!", "STOP.").
  return body
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function classifyInboundSms(body: string, optOutType?: string): { intent: SmsIntent; source: IntentSource } {
  switch ((optOutType ?? '').toUpperCase()) {
    case 'STOP':
      return { intent: 'opt_out', source: 'carrier' };
    case 'START':
      return { intent: 'opt_in', source: 'carrier' };
    case 'HELP':
      return { intent: 'help', source: 'carrier' };
  }

  const word = normalize(body);
  if (OPT_OUT_KEYWORDS.has(word)) return { intent: 'opt_out', source: 'keyword' };
  if (OPT_IN_KEYWORDS.has(word)) return { intent: 'opt_in', source: 'keyword' };
  if (HELP_KEYWORDS.has(word)) return { intent: 'help', source: 'keyword' };
  if (REVOCATION_PHRASES.some((re) => re.test(body))) return { intent: 'opt_out', source: 'phrase' };
  return { intent: 'message', source: 'none' };
}

export function optOutConfirmation(businessName: string): string {
  return `${businessName}: You've been unsubscribed and will receive no further messages. Reply START to resubscribe.`;
}

export function optInConfirmation(businessName: string): string {
  return `${businessName}: You're subscribed to text updates. Msg & data rates may apply. Msg frequency varies. Reply HELP for help, STOP to opt out.`;
}

export function helpMessage(businessName: string, businessNumber: string): string {
  return `${businessName}: For help call ${businessNumber}. Msg & data rates may apply. Reply STOP to opt out.`;
}
