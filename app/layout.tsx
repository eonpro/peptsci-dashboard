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
        {/* Adobe Fonts - Sofia Pro */}
        <link rel="stylesheet" href="https://use.typekit.net/rbf3ldc.css" />
      </head>
      <body className={cn('min-h-screen bg-brand-bg antialiased font-sofia')}>
        <Providers publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
