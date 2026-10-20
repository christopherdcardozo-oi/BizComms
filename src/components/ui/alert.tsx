import * as React from 'react';
import { cn } from '@/lib/ui/cn';

export function Alert({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' | 'success' }) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(
        'animate-rise rounded-md border px-4 py-3 text-sm',
        variant === 'destructive' && 'border-destructive/40 bg-destructive/10 text-destructive',
        variant === 'success' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        variant === 'default' && 'bg-muted text-foreground',
        className
      )}
      {...props}
    />
  );
}
