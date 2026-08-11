import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@site/src/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-sm border px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] uppercase w-fit whitespace-nowrap shrink-0 font-[family-name:var(--mono-font)] [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-primary/50 bg-[color:color-mix(in_oklab,var(--primary)_12%,transparent)] text-primary [a&]:hover:bg-[color:color-mix(in_oklab,var(--primary)_18%,transparent)]',
        secondary:
          'border-border bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)] text-muted-foreground',
        destructive:
          'border-destructive/40 bg-destructive/10 text-destructive [a&]:hover:bg-destructive/20 focus-visible:ring-destructive/20',
        outline: 'border-border bg-transparent text-muted-foreground [a&]:hover:text-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return <Comp data-slot='badge' className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
