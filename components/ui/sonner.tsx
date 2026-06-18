'use client'

import { Toaster as SonnerToaster } from 'sonner'

type ToasterProps = React.ComponentProps<typeof SonnerToaster>

/**
 * App-wide toast host. Mounted once in Providers. Emit toasts anywhere with
 * `import { toast } from 'sonner'`. `richColors` gives semantic success/error
 * coloring that reads well on both the dark admin console and the light shop.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'font-sofia',
        },
      }}
      {...props}
    />
  )
}
