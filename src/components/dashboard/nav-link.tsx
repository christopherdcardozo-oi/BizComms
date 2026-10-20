'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/ui/cn';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // Section roots (/dashboard, /demo) match exactly; deeper links also match their sub-pages.
  const active = pathname === href || (href.split('/').length > 2 && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground'
      )}
    >
      {children}
    </Link>
  );
}
