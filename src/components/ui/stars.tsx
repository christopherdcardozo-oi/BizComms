import { Star } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

export function Stars({ count, className }: { count: number; className?: string }) {
  return (
    <span role="img" aria-label={`${count} out of 5 stars`} className={cn('inline-flex gap-0.5', className)}>
      {Array.from({ length: 5 }, (_, n) => (
        <Star key={n} aria-hidden className={cn('h-3.5 w-3.5', n < count ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted')} />
      ))}
    </span>
  );
}
