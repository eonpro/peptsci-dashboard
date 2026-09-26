import { cn } from '@/lib/utils'

/**
 * Fixed, full-viewport fluid gradient (navy / brand blue / teal / lavender /
 * ice). Pure CSS — see `.fluid-bg` in app/globals.css.
 *
 * Renders at z-index -10, so the owning layout wrapper must create a stacking
 * context (`isolate`) or the wrapper's own background paints over it.
 */
export function FluidBackground({
  variant = 'dark',
  className,
}: {
  variant?: 'dark' | 'light'
  className?: string
}) {
  return (
    <div aria-hidden data-variant={variant} className={cn('fluid-bg', className)}>
      <div className="fluid-blob fluid-blob-d" />
      <div className="fluid-blob fluid-blob-a" />
      <div className="fluid-blob fluid-blob-c" />
      <div className="fluid-blob fluid-blob-b" />
      <div className="fluid-blob fluid-blob-e" />
      <div className="fluid-vignette" />
      <div className="fluid-grain" />
    </div>
  )
}
