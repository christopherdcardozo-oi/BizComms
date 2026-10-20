import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/ui/cn';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary/10 text-blue-800 dark:text-blue-200',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      success: 'border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
      warning: 'border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300',
      destructive: 'border-transparent bg-destructive/15 text-destructive',
      outline: 'text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
