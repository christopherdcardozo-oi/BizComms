// Authentication and access: public pages, redirects for signed-out visitors, wrong passwords,
// sign-in landing on the right page, and sign-out ending the session.
import { expect, signIn, test } from './support/fixtures';

test.describe('Public pages', () => {
  test('home, live demo and legal pages load for visitors', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/missed call/i);

    await page.goto('/demo');
    await expect(page.getByText('Sample data for a fictional business')).toBeVisible();

    for (const path of ['/terms', '/privacy']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
    }
  });
});

test.describe('Authentication', () => {
  test('signed-out visitors are sent to login, then back to the page they wanted', async ({ page, business }) => {
    await page.goto('/dashboard/inbox');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Finbox/);

    await page.getByLabel('Email').fill(business.email);
    await page.getByLabel('Password').fill(business.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard\/inbox$/);
  });

  test('a wrong password shows an error and does not sign in', async ({ page, business }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(business.email);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // (Next.js also renders an empty role="alert" route announcer, so match the message itself.)
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email or password.' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the owner signs in and lands on their own dashboard', async ({ page, business }) => {
    await signIn(page, business);
    await expect(page.getByRole('banner')).toContainText(business.name);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('signing out ends the session', async ({ page, business }) => {
    await signIn(page, business);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
