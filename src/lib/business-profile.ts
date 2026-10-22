// What the business tells the AI about itself (organizations.business_profile), the per-trade
// starting points shown in Settings, and the prompt lines both AIs get from it. Client-safe: the
// settings form uses the presets, the server uses the prompt helpers.
import type { BusinessHours } from './telephony/business-hours';

export const TRADE_IDS = ['plumbing', 'hvac', 'electrical', 'roofing', 'cleaning', 'garage-door', 'pest-control', 'handyman', 'other'] as const;
export type TradeId = (typeof TRADE_IDS)[number];

export interface BusinessProfile {
  trade: TradeId | '';
  services: string;
  serviceArea: string;
  emergencies: string;
  askCallers: string;
  reviewSignOff: string;
}

export const PROFILE_LIMITS = { services: 300, serviceArea: 200, emergencies: 300, askCallers: 300, reviewSignOff: 60 } as const;

export const EMPTY_PROFILE: BusinessProfile = { trade: '', services: '', serviceArea: '', emergencies: '', askCallers: '', reviewSignOff: '' };

type Preset = { label: string; services: string; emergencies: string; askCallers: string };

// Starting text per trade. The receptionist never gives technical advice, so emergencies here are
// about flagging urgency, never about telling a caller what to do with their equipment.
export const TRADE_PRESETS: Record<TradeId, Preset> = {
  plumbing: {
    label: 'Plumbing',
    services: 'Leak and pipe repairs, water heaters, drain cleaning, sewer lines, toilets and fixtures, remodels',
    emergencies: 'Burst pipes, flooding, sewer backups, and no water. Mark these URGENT and tell the caller someone will call back right away.',
    askCallers: 'Ask for the address of the job and whether water is actively leaking.',
  },
  hvac: {
    label: 'Heating & cooling',
    services: 'Furnace and AC repair, new systems, heat pumps, maintenance tune-ups, ductwork, thermostats',
    emergencies: 'No heat in freezing weather and no cooling in extreme heat. Mark these URGENT and tell the caller someone will call back right away.',
    askCallers: 'Ask for the address, whether it is heating or cooling, and roughly how old the system is.',
  },
  electrical: {
    label: 'Electrical',
    services: 'Electrical repairs, panel upgrades, outlets and lighting, ceiling fans, EV chargers, generators',
    emergencies: 'Power out in part of the home. Mark it URGENT. Burning smells or sparking are a danger to people: follow the 911 rule.',
    askCallers: 'Ask for the address and whether the problem affects the whole home or one area.',
  },
  roofing: {
    label: 'Roofing',
    services: 'Roof repairs and leaks, full replacements, storm and hail damage, gutters, free inspections',
    emergencies: 'Active leaks and fresh storm damage. Mark these URGENT.',
    askCallers: 'Ask for the address, whether water is coming inside, and whether it is an insurance claim.',
  },
  cleaning: {
    label: 'House cleaning',
    services: 'Recurring house cleaning, deep cleans, move-in and move-out cleans',
    emergencies: '',
    askCallers: 'Ask how many bedrooms and bathrooms, and how often they would like cleaning.',
  },
  'garage-door': {
    label: 'Garage doors',
    services: 'Broken springs and cables, openers, doors off track, new garage doors',
    emergencies: 'A door stuck open or a car trapped inside. Mark these URGENT.',
    askCallers: 'Ask for the address and whether the door is stuck open or closed.',
  },
  'pest-control': {
    label: 'Pest control',
    services: 'General pest control, ants, mice and rodents, wasps and bees, bed bugs, termites',
    emergencies: 'Stinging insects near people and pests inside the living space. Mark these URGENT.',
    askCallers: 'Ask for the address and what kind of pest they are seeing.',
  },
  handyman: {
    label: 'Handyman',
    services: 'Small repairs, drywall patching, painting, fixtures, furniture assembly, odd jobs',
    emergencies: '',
    askCallers: 'Ask for the address and a short list of the jobs they need done.',
  },
  other: { label: 'Other', services: '', emergencies: '', askCallers: '' },
};

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Normalizes whatever is stored (possibly {} or an older shape) into a complete profile.
export function parseBusinessProfile(raw: unknown): BusinessProfile {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const trade = (TRADE_IDS as readonly string[]).includes(obj.trade as string) ? (obj.trade as TradeId) : '';
  return {
    trade,
    services: clip(obj.services, PROFILE_LIMITS.services),
    serviceArea: clip(obj.serviceArea, PROFILE_LIMITS.serviceArea),
    emergencies: clip(obj.emergencies, PROFILE_LIMITS.emergencies),
    askCallers: clip(obj.askCallers, PROFILE_LIMITS.askCallers),
    reviewSignOff: clip(obj.reviewSignOff, PROFILE_LIMITS.reviewSignOff),
  };
}

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

// "Monday 7am–5pm; …; Sunday closed". Same open and close means open 24 hours (business-hours.ts).
export function describeHours(hours: BusinessHours | null | undefined): string {
  if (!hours) return '';
  const days = WEEK.map((day) => {
    const d = hours[day];
    const name = day[0].toUpperCase() + day.slice(1);
    if (!d || d.closed) return `${name} closed`;
    if (d.open === d.close) return `${name} open 24 hours`;
    return `${name} ${to12h(d.open)}–${to12h(d.close)}`;
  });
  return days.join('; ');
}

// Facts for the phone receptionist, one per line. Empty fields are left out.
export function receptionistContext(profile: BusinessProfile, hours?: BusinessHours | null, timezone?: string): string[] {
  const trade = profile.trade && profile.trade !== 'other' ? TRADE_PRESETS[profile.trade].label.toLowerCase() : '';
  const hoursText = describeHours(hours);
  return [
    trade ? `The business does ${trade}.` : '',
    profile.services ? `Services offered: ${profile.services}.` : '',
    profile.serviceArea ? `Service area: ${profile.serviceArea}. If the caller is outside it, still take their details and say the team will let them know.` : '',
    hoursText ? `Business hours${timezone ? ` (${timezone})` : ''}: ${hoursText}. You may share these hours, but never promise when someone will arrive.` : '',
    profile.emergencies ? `Urgent situations: ${profile.emergencies}` : '',
    profile.askCallers ? `Also: ${profile.askCallers}` : '',
  ]
    .map((line) => line.replace(/\.\.$/, '.'))
    .filter(Boolean);
}

// Facts for the review-reply AI. Hours and intake questions don't belong in a public reply.
export function reviewContext(profile: BusinessProfile): string[] {
  const trade = profile.trade && profile.trade !== 'other' ? TRADE_PRESETS[profile.trade].label.toLowerCase() : '';
  return [
    trade ? `The business is a ${trade} company.` : '',
    profile.services ? `Services: ${profile.services}.` : '',
    profile.serviceArea ? `Serves: ${profile.serviceArea}.` : '',
    profile.reviewSignOff ? `End every reply with this sign-off on its own: ${profile.reviewSignOff}` : '',
  ]
    .map((line) => line.replace(/\.\.$/, '.'))
    .filter(Boolean);
}
