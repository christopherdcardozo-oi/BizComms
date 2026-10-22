// Business profile → what the AI receptionist and review replier are told.
// Run with: npx sucrase-node tests/business-profile.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeHours,
  EMPTY_PROFILE,
  parseBusinessProfile,
  receptionistContext,
  reviewContext,
  TRADE_IDS,
  TRADE_PRESETS,
} from '../src/lib/business-profile';
import { reviewReplyPrompt } from '../src/lib/providers/llm/prompt';
import { receptionistPrompt } from '../src/lib/voice/receptionist';

const PLUMBER = parseBusinessProfile({
  trade: 'plumbing',
  services: TRADE_PRESETS.plumbing.services,
  serviceArea: 'Ames, Nevada and Boone',
  emergencies: TRADE_PRESETS.plumbing.emergencies,
  askCallers: TRADE_PRESETS.plumbing.askCallers,
  reviewSignOff: 'Mike, owner',
});
const HOURS = {
  monday: { open: '07:00', close: '17:00' },
  tuesday: { open: '07:30', close: '17:00' },
  saturday: { open: '00:00', close: '00:00' },
  sunday: { open: '09:00', close: '17:00', closed: true },
};

test('trade presets never tell callers to do repairs themselves (the receptionist gives no technical advice)', () => {
  for (const id of TRADE_IDS) {
    const text = Object.values(TRADE_PRESETS[id]).join(' ');
    assert.doesNotMatch(text, /valve|breaker|turn (it )?off|shut (it )?off|reset|unplug|try (to|checking)/i, id);
  }
});

test('stored profiles are normalized: junk, unknown trades and overlong text are handled', () => {
  assert.deepEqual(parseBusinessProfile(null), EMPTY_PROFILE);
  assert.deepEqual(parseBusinessProfile([1, 2]), EMPTY_PROFILE);
  assert.equal(parseBusinessProfile({ trade: 'astronaut' }).trade, '');
  assert.equal(parseBusinessProfile({ services: 'x'.repeat(999) }).services.length, 300);
  assert.equal(parseBusinessProfile({ serviceArea: '  Ames  ' }).serviceArea, 'Ames');
});

test('hours read naturally, including 24-hour and closed days', () => {
  const text = describeHours(HOURS);
  assert.match(text, /Monday 7am–5pm/);
  assert.match(text, /Tuesday 7:30am–5pm/);
  assert.match(text, /Saturday open 24 hours/);
  assert.match(text, /Sunday closed/);
  assert.match(text, /Wednesday closed/); // not set = closed
  assert.equal(describeHours(null), '');
});

test('the receptionist learns the trade, services, area, hours, urgent cases and intake questions', () => {
  const prompt = receptionistPrompt('Acme Plumbing', null, receptionistContext(PLUMBER, HOURS, 'America/Chicago'));
  assert.match(prompt, /does plumbing/);
  assert.match(prompt, /Water heaters|water heaters/);
  assert.match(prompt, /Service area: Ames, Nevada and Boone/);
  assert.match(prompt, /Business hours \(America\/Chicago\): Monday 7am–5pm/);
  assert.match(prompt, /never promise when someone will arrive/);
  assert.match(prompt, /Urgent situations: Burst pipes/);
  assert.match(prompt, /address of the job/);
  assert.doesNotMatch(prompt, /\.\./);
  // The built-in safety rules still come after the owner's facts.
  assert.ok(prompt.indexOf('Never quote prices') > prompt.indexOf('Service area'));
  assert.match(prompt, /call 911/);
});

test('an empty profile leaves the receptionist prompt exactly as it was before profiles existed', () => {
  assert.deepEqual(receptionistContext(EMPTY_PROFILE, null), []);
  assert.equal(receptionistPrompt('Acme', null, []), receptionistPrompt('Acme', null));
});

test('review replies learn the trade, services, area and sign-off, but never the hours or intake questions', () => {
  const { system } = reviewReplyPrompt({
    businessName: 'Acme Plumbing',
    reviewerName: 'Jordan P.',
    starRating: 5,
    reviewComment: 'Fast and fair.',
    businessContext: reviewContext(PLUMBER),
  });
  assert.match(system, /a plumbing company/);
  assert.match(system, /Serves: Ames, Nevada and Boone/);
  assert.match(system, /sign-off on its own: Mike, owner/);
  assert.doesNotMatch(system, /7am|address of the job|URGENT/);
  assert.match(system, /Never offer discounts/);
});
