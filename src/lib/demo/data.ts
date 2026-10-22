// Sample data for the public /demo dashboard. Everything here is fictional: "Acme" is a placeholder
// business, and every phone number is in the 555-0100–0199 range reserved for fiction, so no real
// person or company appears. Timestamps are relative to `now` so the demo always looks current.
import type { InboxMessage } from '../dashboard/conversations';
import type { CallDetail, ReviewRow } from '../dashboard/queries';
import { receptionistGreeting } from '../voice/receptionist';

export const DEMO_BUSINESS = {
  name: 'Acme Plumbing & Heating',
  number: '+15155550100',
  timezone: 'America/Chicago',
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function transcript(lines: Array<[speaker: 'AI' | 'Caller', text: string]>): string {
  return [`AI: ${receptionistGreeting(DEMO_BUSINESS.name)}`, ...lines.map(([s, t]) => `${s}: ${t}`)].join('\n');
}

export function buildDemoData(now: Date = new Date()) {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

  const call = (c: Partial<CallDetail> & Pick<CallDetail, 'from_number' | 'outcome' | 'duration_seconds'>, ago: number): CallDetail => ({
    id: id(),
    to_number: DEMO_BUSINESS.number,
    status: 'completed',
    sms_rescued: false,
    ai_summary: null,
    transcript: null,
    recording_url: null,
    vapi_ended_reason: null,
    started_at: at(ago),
    ended_at: at(ago - c.duration_seconds * 1000),
    created_at: at(ago),
    ...c,
  });

  const calls: CallDetail[] = [
    call(
      {
        from_number: '+15155550142',
        outcome: 'ai_conversation_completed',
        duration_seconds: 134,
        ai_summary: 'Water heater leaking in the basement, about an inch of water on the floor. Wants someone today. Callback (515) 555-0142.',
        transcript: transcript([
          ['Caller', 'Hi, our water heater is leaking all over the basement floor.'],
          ['AI', "I'm sorry to hear that. Is anyone in danger, or is there any smell of gas?"],
          ['Caller', "No, nothing like that. It's just water. Maybe an inch."],
          ['AI', "Thank you. I'll get this to the team right away. Can I get your name?"],
          ['Caller', "It's Chris."],
          ['AI', 'Thanks, Chris. What is the best number for a callback?'],
          ['Caller', 'This one, 515-555-0142.'],
          ['AI', "Got it. I'll pass this to the team right now, and someone will call you back as soon as possible."],
        ]),
      },
      18 * MIN
    ),
    call({ from_number: '+15155550151', outcome: 'answered_by_business', duration_seconds: 272 }, 1 * HOUR + 4 * MIN),
    call({ from_number: '+15155550177', outcome: 'missed_call_texted', duration_seconds: 21, sms_rescued: true }, 2 * HOUR + 11 * MIN),
    call({ from_number: '+15155550103', outcome: 'caller_abandoned', duration_seconds: 9, sms_rescued: true }, 3 * HOUR + 40 * MIN),
    call(
      {
        from_number: '+15155550188',
        outcome: 'ai_conversation_completed',
        duration_seconds: 102,
        ai_summary: 'Dana: AC running but not cooling, upstairs is 85°. Prefers a morning visit. Callback (515) 555-0188.',
        transcript: transcript([
          ['Caller', "Hi, our AC is running but it's not cooling at all. Upstairs is like 85 degrees."],
          ['AI', "That sounds uncomfortable. I'll get a technician to follow up. May I have your name and the best callback number?"],
          ['Caller', "Dana. 515-555-0188. Mornings work best."],
          ['AI', "Got it, Dana. I'll note that mornings work best, and the team will reach out soon."],
        ]),
      },
      20 * HOUR
    ),
    call({ from_number: '+15155550119', outcome: 'answered_by_business', duration_seconds: 388 }, 1 * DAY + 2 * HOUR),
    call({ from_number: '+15155550166', outcome: 'missed_call_texted', duration_seconds: 18, sms_rescued: true }, 1 * DAY + 5 * HOUR),
    call(
      {
        from_number: '+15155550124',
        outcome: 'ai_conversation_completed',
        duration_seconds: 87,
        ai_summary: 'Pat wants a quote to replace a 15-year-old furnace before winter. Asked for pricing; AI said the team will follow up. Callback (515) 555-0124.',
        transcript: transcript([
          ['Caller', 'How much do you charge to replace a furnace?'],
          ['AI', "I can't give pricing over the phone, but I can have someone follow up with a quote. How old is the current furnace?"],
          ['Caller', 'About fifteen years. I want it done before winter.'],
          ['AI', 'That makes sense. Can I get your name and the best number to reach you?'],
          ['Caller', 'Pat, 515-555-0124.'],
          ['AI', "Thanks, Pat. I've passed this along, and someone will call you back with next steps."],
        ]),
      },
      2 * DAY + 3 * HOUR
    ),
    call({ from_number: '+15155550131', outcome: 'answered_by_business', duration_seconds: 156 }, 2 * DAY + 6 * HOUR),
    call({ from_number: '+15155550109', outcome: 'caller_abandoned_before_ai', duration_seconds: 4, sms_rescued: true }, 3 * DAY + 1 * HOUR),
    call({ from_number: '+15155550145', outcome: 'answered_by_business', duration_seconds: 241 }, 4 * DAY + 2 * HOUR),
    call(
      {
        from_number: '+15155550193',
        outcome: 'ai_conversation_completed',
        duration_seconds: 118,
        ai_summary: 'General contractor asking about rough-in plumbing for a new build next month. Wants a call from the owner. Callback (515) 555-0193.',
        transcript: transcript([
          ['Caller', "I'm a contractor with a new build going up next month. Do you do rough-in?"],
          ['AI', "Thanks for calling. I'll make sure the owner gets your request. What's your name and best callback number?"],
          ['Caller', 'Sam, 515-555-0193. I need to lock someone in this week.'],
          ['AI', "Understood, Sam. I've flagged it as time-sensitive, and the team will reach out soon."],
        ]),
      },
      5 * DAY + 4 * HOUR
    ),
  ];

  const textBack = `Hi, this is ${DEMO_BUSINESS.name}! Sorry we missed your call. How can we help you today? Reply STOP to opt out.`;
  const msg = (m: Omit<InboxMessage, 'id' | 'status' | 'error_code'> & { status?: InboxMessage['status'] }, ago: number): InboxMessage => ({
    id: id(),
    status: m.direction === 'inbound' ? 'received' : 'delivered',
    error_code: null,
    ...m,
    created_at: at(ago),
  });
  const auto = (to: string, ago: number) =>
    msg({ direction: 'outbound_api', from_number: DEMO_BUSINESS.number, to_number: to, body: textBack, type: 'missed_call_auto_reply', created_at: '' }, ago);
  const inbound = (from: string, body: string, ago: number) =>
    msg({ direction: 'inbound', from_number: from, to_number: DEMO_BUSINESS.number, body, type: 'manual_chat', created_at: '' }, ago);
  const reply = (to: string, body: string, ago: number) =>
    msg({ direction: 'outbound_api', from_number: DEMO_BUSINESS.number, to_number: to, body, type: 'manual_chat', created_at: '' }, ago);

  // Oldest first within each thread; the inbox groups them newest-first.
  const messages: InboxMessage[] = [
    auto('+15155550177', 2 * HOUR + 10 * MIN),
    inbound('+15155550177', 'Is this the plumber? I need a quote on a new water heater, 50 gallon.', 1 * HOUR + 52 * MIN),

    auto('+15155550103', 3 * HOUR + 39 * MIN),
    inbound('+15155550103', 'Hi! Kitchen sink is backing up. Can someone come today?', 3 * HOUR + 31 * MIN),
    reply('+15155550103', 'Yes, we can be there around 3pm. What’s the address?', 3 * HOUR + 20 * MIN),
    inbound('+15155550103', '1420 Maple St. Thank you!', 3 * HOUR + 18 * MIN),

    reply('+15155550188', 'Hi Dana, this is Acme Plumbing & Heating following up on your AC. We have tomorrow at 8am open. Does that work?', 19 * HOUR),
    inbound('+15155550188', 'Perfect, see you at 8.', 18 * HOUR + 40 * MIN),

    auto('+15155550166', 1 * DAY + 5 * HOUR),
    inbound('+15155550166', 'STOP', 1 * DAY + 4 * HOUR + 58 * MIN),

    auto('+15155550109', 3 * DAY + 1 * HOUR),
    inbound('+15155550109', 'Never mind, my neighbor helped me fix it. Thanks anyway!', 3 * DAY + 30 * MIN),
  ];
  const optedOut = new Set(['+15155550166']);

  const review = (r: Partial<ReviewRow> & Pick<ReviewRow, 'reviewer_name' | 'star_rating' | 'reply_status'>, ago: number): ReviewRow => ({
    id: id(),
    comment: null,
    sentiment: r.star_rating >= 4 ? 'positive' : r.star_rating === 3 ? 'neutral' : 'negative',
    reply_text: null,
    reply_published_at: null,
    reply_error: null,
    ai_model: 'gpt-4o-mini',
    ...r,
    review_created_at: at(ago),
  });

  const reviews: ReviewRow[] = [
    review(
      {
        reviewer_name: 'Kevin L.',
        star_rating: 2,
        comment: 'Had to wait two days for a callback. Work was fine once they showed up.',
        reply_status: 'manual_review',
        reply_text:
          'Hi Kevin, thank you for the honest feedback, and we’re sorry the callback took longer than you expected. We’d like to hear more so we can do better. Please give us a call at (515) 555-0100.',
      },
      5 * HOUR
    ),
    review({ reviewer_name: 'Anonymous', star_rating: 1, reply_status: 'manual_review', reply_text: 'Thank you for your rating. We’re sorry your experience fell short and would like to make it right. Please call us at (515) 555-0100 so we can talk it through.' }, 9 * HOUR),
    review(
      {
        reviewer_name: 'Jordan P.',
        star_rating: 5,
        comment: 'Showed up on time and fixed our leak fast. Fair price too.',
        reply_status: 'published',
        reply_text: 'Thank you, Jordan! We’re glad we could get it fixed quickly, and we appreciate you choosing us.',
      },
      1 * DAY + 3 * HOUR
    ),
    review(
      {
        reviewer_name: 'Maria G.',
        star_rating: 5,
        comment: 'A pipe burst on a Sunday and they had someone out within the hour. Lifesavers.',
        reply_status: 'published',
        reply_text: 'Thank you, Maria! A burst pipe on a Sunday is stressful, and we’re glad we could get there fast.',
      },
      3 * DAY + 2 * HOUR
    ),
    review(
      {
        reviewer_name: 'Tom R.',
        star_rating: 4,
        comment: 'Good, clean work. A little more than I expected to pay, but they explained everything.',
        reply_status: 'published',
        reply_text: 'Thanks, Tom! We appreciate the kind words and you taking the time to review us.',
      },
      6 * DAY
    ),
    review({ reviewer_name: 'Alicia W.', star_rating: 5, comment: 'Friendly and fast. Will call again.', reply_status: 'pending', ai_model: null }, 25 * MIN),
  ];

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
  const stats = {
    // Month-to-date figures for the sample business (calls shown above plus earlier ones).
    calls: 47,
    rescued: 12,
    textsSent: 31,
    recoveredCents: 235000, // sample: jobs the owner logged as won by text
    monthStart,
  };

  return { business: DEMO_BUSINESS, calls, messages, optedOut, reviews, stats };
}

export type DemoData = ReturnType<typeof buildDemoData>;
