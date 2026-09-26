import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// `before:` draws the glossy upper sheen on the liquid variants. No
// overflow-hidden: icon buttons carry absolutely positioned count badges that
// must be allowed to overflow the pill.
const liquidSheen =
  'before:pointer-events-none before:absolute before:-z-10 before:inset-x-px before:top-px before:h-1/2 before:rounded-[inherit] before:bg-linear-to-b before:from-white/30 before:to-white/0'

const buttonVariants = cva(
  'relative isolate inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: cn(
          'bg-linear-to-b from-[#4a66ff] to-brand-primary text-primary-foreground shadow-liquid hover:from-[#5b76ff] hover:to-[#2a45f5] hover:shadow-liquid-hover',
          liquidSheen
        ),
        destructive: cn(
          'bg-linear-to-b from-red-500 to-red-600 text-destructive-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.3),0_8px_22px_-8px_rgb(220_38_38/0.7)] hover:from-red-400 hover:to-red-600',
          liquidSheen
        ),
        // bg-transparent (not bg-background): dialogs/popovers portal outside the
        // `.dark` scope, where bg-background resolves to the light theme and
        // produced white buttons with white text. text-foreground is explicit
        // because inherited color comes from <body> (light scope) and is
        // invisible on dark dashboard pages.
        outline:
          'border border-slate-300/80 bg-white/40 text-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.7)] backdrop-blur-md hover:bg-white/70 dark:border-white/15 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08)] dark:hover:border-white/25 dark:hover:bg-white/10',
        secondary:
          'border border-white/60 bg-white/55 text-secondary-foreground shadow-glass backdrop-blur-md hover:bg-white/75 dark:border-white/10 dark:bg-white/[0.08] dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.1)] dark:hover:bg-white/[0.14]',
        glass: cn(
          'border border-white/70 bg-linear-to-b from-white/70 to-white/35 text-foreground shadow-glass backdrop-blur-xl hover:from-white/85 dark:border-white/[0.16] dark:from-white/[0.16] dark:to-white/[0.04] dark:text-white dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18),0_10px_30px_-12px_rgb(46_230_208/0.35)] dark:hover:border-brand-teal/40 dark:hover:from-white/[0.22]',
          liquidSheen
        ),
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-white/10',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 px-3.5',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
