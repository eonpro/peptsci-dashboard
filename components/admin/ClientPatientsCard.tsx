'use client'

/**
 * Admin view of a practice's saved patients with the clinic <-> PeptSci
 * message thread per patient. Unread badges count clinic messages the staff
 * hasn't opened yet; opening a thread marks it read and clears the badge.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PatientChatDialog } from '@/components/PatientChatDialog'
import { UserRound, MessagesSquare, Loader2 } from 'lucide-react'

interface AdminPatient {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  unreadMessages: number
}

export function ClientPatientsCard({ clientId }: { clientId: string }) {
  const [patients, setPatients] = useState<AdminPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [chatPatient, setChatPatient] = useState<AdminPatient | null>(null)

  const load = useCallback(() => {
    fetch(`/api/admin/clients/${clientId}/patients`)
      .then((r) => (r.ok ? r.json() : { patients: [] }))
      .then((data) => setPatients(data.patients ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 60_000)
    return () => clearInterval(timer)
  }, [load])

  return (
    <Card className="bg-[#0a0e3a]/50 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <UserRound className="h-5 w-5" /> Patients & Messages
        </CardTitle>
        <CardDescription className="text-white/50">
          The practice&apos;s saved patients. Open a thread to chat with the clinic about a
          patient.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-white/40">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : patients.length === 0 ? (
          <p className="text-sm text-white/50">This practice has no saved patients yet.</p>
        ) : (
          patients.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-white/10 p-3 text-sm"
            >
              <div>
                <p className="font-medium text-white">
                  {p.firstName} {p.lastName}
                </p>
                <p className="text-white/50">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="relative border-white/20 text-white hover:bg-white/10"
                onClick={() => setChatPatient(p)}
              >
                <MessagesSquare className="h-4 w-4 mr-1.5" /> Messages
                {p.unreadMessages > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {p.unreadMessages}
                  </span>
                )}
              </Button>
            </div>
          ))
        )}
      </CardContent>

      {chatPatient && (
        <PatientChatDialog
          open
          onOpenChange={(open) => !open && setChatPatient(null)}
          patientId={chatPatient.id}
          patientName={`${chatPatient.firstName} ${chatPatient.lastName}`}
          viewerRole="PEPTSCI"
          onRead={() =>
            setPatients((prev) =>
              prev.map((p) => (p.id === chatPatient.id ? { ...p, unreadMessages: 0 } : p))
            )
          }
        />
      )}
    </Card>
  )
}
