// Creates the three plan products and monthly prices in Stripe, configures the default customer
// portal (switch plans, cancel at period end, update card, invoices), turns on ACH bank payments,
// and writes the price IDs
// into .env.local. Safe to re-run: products and prices are found by lookup key, not duplicated.
//
// Usage: node scripts/stripe-setup.mjs          (test mode keys only)
//        node scripts/stripe-setup.mjs --live   (required to run against a live sk_live_ key)
import fs from 'node:fs';
import Stripe from 'stripe';

const ENV_PATH = '.env.local';

const PLANS = [
  { id: 'text-back', env: 'STRIPE_PRICE_TEXT_BACK', name: 'Text-Back', cents: 2900, description: 'Missed-call text-back, shared inbox, call log' },
  { id: 'receptionist', env: 'STRIPE_PRICE_RECEPTIONIST', name: 'Receptionist', cents: 8900, description: 'Everything in Text-Back plus the AI receptionist (200 min/month)' },
  { id: 'complete', env: 'STRIPE_PRICE_COMPLETE', name: 'Complete', cents: 12900, description: 'Everything in Receptionist plus Google review replies' },
];

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function writeEnvValue(key, value) {
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  const line = `${key}="${value}"`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  fs.writeFileSync(ENV_PATH, re.test(text) ? text.replace(re, line) : `${text.replace(/\n*$/, '\n')}${line}\n`);
}

async function findOrCreatePrice(stripe, plan) {
  const lookupKey = `bizcomms_${plan.id.replace('-', '_')}_monthly`;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, expand: ['data.product'] });
  const found = existing.data[0];
  if (found) {
    if (found.unit_amount !== plan.cents || found.recurring?.interval !== 'month') {
      throw new Error(`${plan.name}: existing price ${lookupKey} doesn't match ${plan.cents / 100}/month; fix it in Stripe first.`);
    }
    return { price: found, productId: typeof found.product === 'string' ? found.product : found.product.id, created: false };
  }
  const product = await stripe.products.create({ name: plan.name, description: plan.description, metadata: { bizcomms_plan: plan.id } });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: plan.cents,
    recurring: { interval: 'month' },
    lookup_key: lookupKey,
    metadata: { bizcomms_plan: plan.id },
  });
  return { price, productId: product.id, created: true };
}

// Bank debit (ACH) costs about a third of card fees. Checkout only offers it when it's on in the
// account's default payment method configuration, so switch it on there.
async function enableAch(stripe) {
  const configs = await stripe.paymentMethodConfigurations.list({ limit: 20 });
  const config = configs.data.find((c) => c.is_default && !c.application) ?? configs.data.find((c) => c.is_default);
  if (!config) return 'no default configuration found; turn on ACH Direct Debit in Settings → Payment methods';
  if (config.us_bank_account?.display_preference?.value === 'on') return 'already on';
  await stripe.paymentMethodConfigurations.update(config.id, { us_bank_account: { display_preference: { preference: 'on' } } });
  return 'turned on';
}

async function configurePortal(stripe, results) {
  const features = {
    customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations',
      products: results.map((r) => ({ product: r.productId, prices: [r.price.id] })),
    },
  };
  const defaults = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (defaults.data[0]) {
    await stripe.billingPortal.configurations.update(defaults.data[0].id, { features });
    return 'updated';
  }
  await stripe.billingPortal.configurations.create({ features, business_profile: { headline: 'Manage your subscription' } });
  return 'created';
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) throw new Error('No .env.local found.');
  const key = readEnv().STRIPE_SECRET_KEY ?? '';
  if (!/^(sk|rk)_(test|live)_/.test(key)) throw new Error('STRIPE_SECRET_KEY is missing or not a Stripe secret key.');
  const live = key.includes('_live_');
  if (live && !process.argv.includes('--live')) throw new Error('That is a LIVE key. Re-run with --live only when you mean to set up real billing.');
  console.log(`Stripe ${live ? 'LIVE' : 'test'} mode`);

  const stripe = new Stripe(key);
  const results = [];
  for (const plan of PLANS) {
    const r = await findOrCreatePrice(stripe, plan);
    writeEnvValue(plan.env, r.price.id);
    console.log(`  ${r.created ? 'created' : 'found  '} ${plan.name.padEnd(13)} $${plan.cents / 100}/month  -> ${plan.env}`);
    results.push(r);
  }
  console.log(`  customer portal ${await configurePortal(stripe, results)} (switch plans, cancel at period end, card, invoices)`);
  console.log(`  ACH bank payments: ${await enableAch(stripe)}`);
  console.log('Done. Price IDs saved to .env.local.');
}

main().catch((err) => {
  console.error(`Stripe setup failed: ${err.message}`);
  process.exit(1);
});
