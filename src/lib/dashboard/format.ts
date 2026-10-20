import type { CallOutcome } from '../../types/database.types';

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export const OUTCOME_LABELS: Record<CallOutcome, { label: string; tone: 'success' | 'warning' | 'secondary' | 'default' }> = {
  answered_by_business: { label: 'Answered', tone: 'success' },
  missed_call_texted: { label: 'Missed · texted back', tone: 'default' },
  caller_abandoned: { label: 'Hung up', tone: 'warning' },
  caller_abandoned_before_ai: { label: 'Hung up', tone: 'warning' },
  forwarded_to_ai: { label: 'AI receptionist', tone: 'secondary' },
  ai_conversation_completed: { label: 'AI handled', tone: 'success' },
  voicemail: { label: 'Voicemail', tone: 'secondary' },
};
