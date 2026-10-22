// Browser + HTTP tests against a real Next.js dev server and the TEST Supabase project.
// Outside services are never charged: texts use the mock SMS sender (rows are still written, and
// the app refuses mock mode in production), billing and voice AI are mocked, and Twilio webhooks
// are signed with a test-only auth token so the real signature check still runs.
//
// Run: npm run test:pw   (writes throwaway rows to Supabase and deletes them afterwards)
import { defineConfig, devices } from '@playwright/test';

const PORT = 3020;
export const BASE_URL = `http://localhost:${PORT}`;
export const TEST_TWILIO_AUTH_TOKEN = 'playwright-twilio-auth-token';

export default defineConfig({
  testDir: 'tests/playwright',
  // One server and one shared test database: run files one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NEXT_PUBLIC_SIGNUPS_OPEN: 'true',
      USE_MOCK_TELEPHONY: 'false', // real Twilio signature verification
      USE_MOCK_SMS: 'true', // record texts, never send them
      USE_MOCK_BILLING: 'true',
      USE_MOCK_VOICE_AI: 'true',
      USE_MOCK_GOOGLE_REVIEWS: 'true',
      LLM_PROVIDER: 'mock',
      TWILIO_AUTH_TOKEN: TEST_TWILIO_AUTH_TOKEN,
      TWILIO_WEBHOOK_BASE_URL: BASE_URL,
      EMERGENCY_KILL_SWITCH: 'false',
      SMS_KEYWORD_REPLIES: 'twilio',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
