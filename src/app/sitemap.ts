import type { MetadataRoute } from 'next';
import { serverEnv } from '@/lib/config/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = serverEnv.appUrl();
  return ['', '/demo', '/book', '/terms', '/privacy'].map((path) => ({ url: `${appUrl}${path}` }));
}
