import type { Metadata, Viewport } from 'next'
import './globals.css'
import { cn } from '@/lib/utils'
import { Providers } from '@/components/Providers'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

// `viewport-fit=cover` lets the page extend under the iOS home-indicator /
// collapsed-toolbar area. Without it, env(safe-area-inset-bottom) is always 0
// and fixed bottom elements (mobile nav) float detached above a strip of
// exposed page content instead of hugging the screen edge.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  // Absolute base for OG/twitter image URLs (scrapers reject relative paths).
  metadataBase: new URL(APP_URL),
  // NOTE: no title template — child pages already suffix "| PeptSci" themselves.
  title: 'PeptSci — Research Peptides for Licensed Practices',
  description:
    'Members-only platform for licensed practices to order high-purity, third-party-tested research peptides with transparent practice pricing.',
  openGraph: {
    type: 'website',
    siteName: 'PeptSci',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
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
