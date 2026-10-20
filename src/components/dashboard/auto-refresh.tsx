'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Re-fetches server components on an interval so new calls/texts show up without a reload.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
