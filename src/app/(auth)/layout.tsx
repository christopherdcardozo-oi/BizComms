import Link from 'next/link';
import { siteConfig } from '@/lib/site';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="stagger flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" style={{ '--i': 0 } as React.CSSProperties} className="text-xl font-semibold tracking-tight">
        {siteConfig.name}
      </Link>
      <div style={{ '--i': 1 } as React.CSSProperties} className="flex w-full justify-center">
        {children}
      </div>
    </main>
  );
}
