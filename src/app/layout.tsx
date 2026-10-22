import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import { publicAppUrl } from '@/lib/config/env';
import { siteConfig } from '@/lib/site';
import './globals.css';

// Display face for headlines only (self-hosted by next/font; no requests to Google at runtime).
// Body text stays on the platform UI font, which is tuned for small sizes on every device.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });


export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl()),
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
