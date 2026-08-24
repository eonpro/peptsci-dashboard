'use client'

import { createContext, useContext } from 'react'
import type { PartnerKind, PartnerRole } from '@/lib/partners/auth'
import { partnerCanMutate } from '@/lib/partners/portal'

export type PartnerPortalValue = {
  kind: PartnerKind
  role: PartnerRole | null
  marginModel: boolean
  canWrite: boolean
}

const PartnerPortalContext = createContext<PartnerPortalValue>({
  kind: 'ORG',
  role: 'OWNER',
  marginModel: false,
  canWrite: true,
})

export function PartnerPortalProvider({
  kind,
  role,
  marginModel,
  children,
}: {
  kind: PartnerKind
  role: PartnerRole | null
  marginModel: boolean
  children: React.ReactNode
}) {
  return (
    <PartnerPortalContext.Provider
      value={{ kind, role, marginModel, canWrite: partnerCanMutate(kind, role) }}
    >
      {children}
    </PartnerPortalContext.Provider>
  )
}

export function usePartnerPortal(): PartnerPortalValue {
  return useContext(PartnerPortalContext)
}
