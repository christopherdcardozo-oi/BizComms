// Plan resolution and feature gates. Run with: npx sucrase-node tests/plans.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkoutPriceFor, isPlanId, planFeatures, planForPrice } from '../src/lib/billing/plans';
import { handleIncomingCall } from '../src/lib/telephony/handlers';

const PRICES = { 'text-back': 'price_tb', receptionist: 'price_rc', complete: 'price_cp' };

test('each plan price maps to its plan and features', () => {
  assert.equal(planForPrice('price_tb', PRICES), 'text-back');
  assert.equal(planForPrice('price_rc', PRICES), 'receptionist');
  assert.equal(planForPrice('price_cp', PRICES), 'complete');
  assert.deepEqual(planFeatures('price_tb', PRICES), { aiReceptionist: false, reviews: false });
  assert.deepEqual(planFeatures('price_rc', PRICES), { aiReceptionist: true, reviews: false });
  assert.deepEqual(planFeatures('price_cp', PRICES), { aiReceptionist: true, reviews: true });
});

test('an unknown or missing price gets the smallest plan, never extra features', () => {
  assert.equal(planForPrice('price_other', PRICES), 'text-back');
  assert.equal(planForPrice(null, PRICES), 'text-back');
  assert.equal(planForPrice(undefined, PRICES), 'text-back');
});

test('single-price mode (no plan prices configured) keeps every feature, as before plans', () => {
  assert.equal(planForPrice('price_anything', {}), 'complete');
  assert.equal(planForPrice(null, {}), 'complete');
});

test('the legacy STRIPE_PRICE_STARTER subscription keeps every feature after plans launch', () => {
  const before = process.env.STRIPE_PRICE_STARTER;
  process.env.STRIPE_PRICE_STARTER = 'price_legacy';
  try {
    assert.equal(planForPrice('price_legacy', PRICES), 'complete');
    assert.equal(checkoutPriceFor('receptionist', {}), 'price_legacy');
  } finally {
    if (before === undefined) delete process.env.STRIPE_PRICE_STARTER;
    else process.env.STRIPE_PRICE_STARTER = before;
  }
});

test('checkout sells the chosen plan’s price, or nothing when that price is missing', () => {
  assert.equal(checkoutPriceFor('complete', PRICES), 'price_cp');
  assert.equal(checkoutPriceFor('receptionist', { complete: 'price_cp' }), undefined);
});

test('only the three plan ids are accepted from the form', () => {
  assert.ok(isPlanId('receptionist'));
  assert.ok(!isPlanId('enterprise'));
  assert.ok(!isPlanId(null));
});

test('a Text-Back customer with the AI switched on still rings the owner after hours, never the AI', async () => {
  const { makeDeps, CALL, LINE, TUESDAY_8PM_CHICAGO } = await import('./support/telephony-fakes');
  const saved = { tb: process.env.STRIPE_PRICE_TEXT_BACK, rc: process.env.STRIPE_PRICE_RECEPTIONIST };
  process.env.STRIPE_PRICE_TEXT_BACK = 'price_tb';
  process.env.STRIPE_PRICE_RECEPTIONIST = 'price_rc';
  try {
    for (const [priceId, expectAi] of [['price_tb', false], ['price_rc', true]] as const) {
      const { deps, repo } = makeDeps({ now: () => TUESDAY_8PM_CHICAGO });
      repo.lines.set(LINE.twilioPhoneNumber, { ...LINE, stripePriceId: priceId });
      const res = await handleIncomingCall(CALL, deps);
      assert.equal(/<Sip>/.test(res.twiml!), expectAi, priceId);
      if (!expectAi) assert.match(res.twiml!, /<Number>\+12025550199<\/Number>/);
    }
  } finally {
    for (const [k, v] of [['STRIPE_PRICE_TEXT_BACK', saved.tb], ['STRIPE_PRICE_RECEPTIONIST', saved.rc]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
