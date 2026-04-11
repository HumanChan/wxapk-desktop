import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'border-transparent bg-destructive text-white hover:bg-destructive/90',
        outline: 'text-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
      },
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <div className={cn(badgeVariants({ className, variant }))} {...props} />;
}

export { Badge, badgeVariants };
