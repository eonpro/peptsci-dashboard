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
      <body className={cn('min-h-screen bg-brand-bg antialiased font-sans')}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}