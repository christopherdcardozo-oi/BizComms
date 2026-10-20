import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { siteConfig } from '@/lib/site';
import './globals.css';

// Display face for headlines only (self-hosted by next/font; no requests to Google at runtime).
// Body text stays on the platform UI font, which is tuned for small sizes on every device.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: siteConfig.name,
  description: 'Missed-call text-back, an AI receptionist and Google review replies for home-service trades.',
  openGraph: { siteName: siteConfig.name, type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
