import type { MetadataRoute } from 'next';
import { serverEnv } from '@/lib/config/env';

// Public pages are crawlable; the app, auth and webhooks are not.
export default function robots(): MetadataRoute.Robots {
  const appUrl = serverEnv.appUrl();
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/onboarding', '/api/', '/auth/'] },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
