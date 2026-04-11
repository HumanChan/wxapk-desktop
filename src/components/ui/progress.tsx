import * as React from 'react';

import { cn } from '../../lib/utils';

interface ProgressProps extends React.ComponentProps<'div'> {
  value?: number;
}

function Progress({
  className,
  value = 0,
  ...props
}: ProgressProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
        className,
      )}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value))}%)` }}
      />
    </div>
  );
}

export { Progress };
