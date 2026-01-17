import type { Metadata } from 'next'
import './globals.css'
import { cn } from '@/lib/utils'
import { ClerkProvider } from '@clerk/nextjs'
import { Header } from '@/components/Header'

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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#5B4BFF',
          colorText: '#050722',
          colorBackground: '#F2F0EA',
        },
        elements: {
          card: 'shadow-[0px_32px_120px_-60px_rgba(91,75,255,0.45)] border border-white/70',
          footer: 'hidden',
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body className={cn('min-h-screen bg-brand-bg antialiased font-sans')}>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}