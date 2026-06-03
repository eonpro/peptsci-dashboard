'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode } from 'react'

interface ProvidersProps {
  children: ReactNode
  /**
   * Passed from the server root layout (read at runtime) so the value is
   * identical during SSR and client hydration. Relying on a client-inlined
   * `process.env.NEXT_PUBLIC_*` here is unsafe: if the key is absent at BUILD
   * time it inlines as `undefined` on the client even when it exists at server
   * runtime, so the server renders <ClerkProvider> but the client does not —
   * producing "SignedIn can only be used within the <ClerkProvider />".
   */
  publishableKey?: string
}

export function Providers({ children, publishableKey }: ProvidersProps) {
  // If Clerk is not configured, render children without ClerkProvider
  if (!publishableKey?.startsWith('pk_')) {
    return <>{children}</>
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
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
