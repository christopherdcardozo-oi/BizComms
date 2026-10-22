// Dashboard loading and the actions an owner takes, each checked against the database rows the
// app writes (call_logs, messages, organizations).
import { eventually, expect, signIn, test } from './support/fixtures';

// Matches formatNanp(): +15155550123 -> (515) 555-0123
const pretty = (e164: string) => `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;

test.beforeEach(async ({ page, business }) => {
  await signIn(page, business);
});

test("calls page shows this month's stats and the AI call with its summary", async ({ page, business }) => {
  await expect(page.getByText('Calls this month')).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(pretty(business.aiCaller).replace(/[()]/g, '\\$&')) });
  await expect(row).toContainText('Water heater leaking');
});

test('call detail shows the summary and the transcript with the AI disclosure', async ({ page, business }) => {
  await page.getByRole('link', { name: pretty(business.aiCaller) }).click();
  await expect(page.getByRole('heading', { name: 'Transcript' })).toBeVisible();
  await expect(page.getByText(/automated assistant, and this call may be recorded/)).toBeVisible();
});

test('a reply from the inbox is saved as an outbound text (recorded by the mock sender, never sent)', async ({ page, business, db }) => {
  await page.getByRole('link', { name: 'Inbox' }).click();
  const conversation = page.getByRole('link', { name: new RegExp(pretty(business.texter).replace(/[()]/g, '\\$&')) });
  await expect(conversation).toContainText('Needs reply');
  await conversation.click();

  const reply = `Yes! We can quote that today. (${Date.now()})`;
  await page.getByPlaceholder('Type a reply…').fill(reply);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(reply)).toBeVisible();

  const row = await eventually(async () =>
    (await db.from('messages').select('*').eq('organization_id', business.orgId).eq('to_number', business.texter).eq('body', reply).maybeSingle()).data
  );
  expect(row).toMatchObject({ direction: 'outbound_api', from_number: business.businessNumber, type: 'manual_chat' });
  expect(String(row.message_sid)).toMatch(/^SM_mock_/); // proof it went through the mock sender
});

test("one business never sees another business's calls", async ({ page, db, otherBusiness }) => {
  await expect(page.getByText('Calls this month')).toBeVisible();
  await expect(page.getByText(pretty(otherBusiness.aiCaller))).toHaveCount(0);

  const { data: theirCall } = await db.from('call_logs').select('id').eq('organization_id', otherBusiness.orgId).limit(1).single();
  const res = await page.goto(`/dashboard/calls/${(theirCall as { id: string }).id}`);
  expect(res?.status()).toBe(404);
});

test('saving the business profile updates organizations.business_profile', async ({ page, business, db }) => {
  await page.getByRole('link', { name: 'Settings' }).click();
  const card = page.locator('form').filter({ has: page.getByLabel('Trade') });

  await card.getByLabel('Trade').selectOption('plumbing');
  await expect(card.getByLabel('Services you offer')).toHaveValue(/water heaters/);
  await card.getByLabel('Towns you serve').fill('Ames, Nevada and Boone');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('status')).toContainText('Saved');

  const org = await eventually(
    async () => (await db.from('organizations').select('business_profile').eq('id', business.orgId).single()).data as { business_profile: Record<string, string> } | null,
    (o) => o.business_profile?.trade === 'plumbing'
  );
  expect(org.business_profile).toMatchObject({ trade: 'plumbing', serviceArea: 'Ames, Nevada and Boone' });
});

test('Text-Back shows forwarded minutes against the fair-use allowance, and warns near the limit', async ({ page, business, db }) => {
  // A billing customer on no recognized plan price resolves to Text-Back; 450 answered minutes = 90%.
  await db.from('organizations').update({ stripe_customer_id: 'cus_playwright' }).eq('id', business.orgId);
  await db.from('call_logs').insert({
    organization_id: business.orgId,
    call_sid: `CApwfairuse${Date.now()}`,
    from_number: '+15551230099',
    to_number: business.businessNumber,
    status: 'completed',
    outcome: 'answered_by_business',
    duration_seconds: 450 * 60,
  });

  await page.goto('/dashboard/settings');
  await expect(page.getByText('Forwarded call minutes this month:')).toContainText('450 of 500');
  await expect(page.getByText(/close to your plan's fair-use allowance\. Calls keep forwarding as normal/)).toBeVisible();
});
