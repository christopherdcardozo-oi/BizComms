const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type Day = (typeof DAYS)[number];

export interface DayHours {
  open: string; // "HH:MM", local to the organization's timezone
  close: string;
  closed?: boolean;
}

export type BusinessHours = Partial<Record<Day, DayHours>>;

function toMinutes(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function localDayAndMinutes(at: Date, timezone: string): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    dayIndex: DAYS.indexOf(get('weekday').toLowerCase() as Day),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

// True when `at` falls inside the organization's posted hours. Overnight windows
// (e.g. 22:00-02:00) spill into the next day, and open === close means open 24h.
// Missing or malformed config is treated as open: the call then rings the owner first,
// which is the conservative path (the AI still picks up on no-answer).
export function isWithinBusinessHours(hours: BusinessHours | null, timezone: string, at: Date): boolean {
  if (!hours) return true;

  let local: { dayIndex: number; minutes: number };
  try {
    local = localDayAndMinutes(at, timezone);
  } catch {
    return true; // invalid IANA timezone
  }
  if (local.dayIndex < 0) return true;

  const today = hours[DAYS[local.dayIndex]];
  const yesterday = hours[DAYS[(local.dayIndex + 6) % 7]];

  if (today && !today.closed) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (open === null || close === null) return true;
    if (open === close) return true;
    if (close > open && local.minutes >= open && local.minutes < close) return true;
    if (close < open && local.minutes >= open) return true;
  }

  if (yesterday && !yesterday.closed) {
    const open = toMinutes(yesterday.open);
    const close = toMinutes(yesterday.close);
    if (open !== null && close !== null && close < open && local.minutes < close) return true;
  }

  return false;
}
