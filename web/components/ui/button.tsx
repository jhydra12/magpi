import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/** shadcn's Button on the Supabase semantic tokens. Uses bg-(--muted), not the bg-muted alias. */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-panel text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input focus-visible:ring-offset-2 focus-visible:ring-offset-background enabled:active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:enabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-600 text-background hover:bg-brand-500',
        outline: 'border border-input bg-transparent text-foreground hover:bg-(--muted)',
        secondary: 'bg-(--muted) text-foreground hover:bg-secondary',
        ghost: 'text-muted-foreground hover:bg-(--muted) hover:text-foreground',
        destructive: 'bg-destructive-500 text-background hover:bg-destructive-400',
        link: 'text-brand-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
