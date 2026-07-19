import type { Metadata } from 'next'
import './globals.css'
import { cn } from '@/lib/utils'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: 'PEPTSCI Dashboard',
  description: 'Production-ready dashboard for PEPTSCI sales, inventory, and analytics',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Adobe Fonts - Sofia Pro. Preconnect to the Typekit CSS + font-file
            hosts so the TLS/DNS handshake happens in parallel with HTML parse,
            shaving latency off this render-blocking stylesheet (faster FCP/LCP). */}
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://use.typekit.net" />
        <link rel="stylesheet" href="https://use.typekit.net/rbf3ldc.css" />
      </head>
      {/* bg-background (not the hardcoded bg-brand-bg) so the canvas color
          follows the theme: ThemeScope hoists `.dark` to <html>, making the
          browser canvas dark on shop/dashboard pages. Otherwise window
          resizes and overscroll expose a light-beige band around the dark
          UI. :root --background === brand-bg, so light pages are unchanged. */}
      <body className={cn('min-h-screen bg-background antialiased font-sofia')}>
        <Providers publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
