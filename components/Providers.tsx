'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode } from 'react'

interface ProvidersProps {
  children: ReactNode
}

// Check if Clerk publishable key is configured
const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

export function Providers({ children }: ProvidersProps) {
  // If Clerk is not configured, render children without ClerkProvider
  if (!hasClerkKey) {
    return <>{children}</>
  }

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
      {children}
    </ClerkProvider>
  )
}
