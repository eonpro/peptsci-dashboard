'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Building2, ChevronRight, Clock } from 'lucide-react'

interface PendingClient {
  id: string
  organizationName: string
  providerName: string | null
  npiNumber: string | null
  contactEmail: string | null
  onboardingStatus: 'PENDING' | 'NEEDS_INFO'
  createdAt: string
}

const AWAITING_REVIEW = new Set(['PENDING', 'NEEDS_INFO'])

/**
 * Approval queue for self-service onboarding submissions. Renders nothing when
 * no practice is awaiting review, so the dashboard stays clean day to day.
 */
export function PendingApprovals() {
  const [pending, setPending] = useState<PendingClient[]>([])

  useEffect(() => {
    fetch('/api/admin/clients')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((data) =>
        setPending(
          ((data.clients ?? []) as PendingClient[]).filter((c) =>
            AWAITING_REVIEW.has(c.onboardingStatus)
          )
        )
      )
      .catch(() => {})
  }, [])

  if (pending.length === 0) return null

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-white">
            <Clock className="h-5 w-5 text-amber-400" />
            Pending Account Approvals
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              {pending.length}
            </Badge>
          </CardTitle>
          <Link href="/clients">
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 bg-[#0a0e3a] text-white/70 hover:bg-white/10 hover:text-white"
            >
              View all clients
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-[#0a0e3a]/50 px-4 py-3 transition-colors hover:bg-white/5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2">
                <Building2 className="h-4 w-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{c.organizationName}</div>
                <div className="truncate text-xs text-white/50">
                  {[c.providerName, c.npiNumber && `NPI ${c.npiNumber}`, c.contactEmail]
                    .filter(Boolean)
                    .join(' · ') || 'No details provided'}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-xs text-white/40 sm:inline">
                {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
              </span>
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-400"
              >
                {c.onboardingStatus === 'NEEDS_INFO' ? 'NEEDS INFO' : 'PENDING'}
              </Badge>
              <ChevronRight className="h-4 w-4 text-white/40" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
