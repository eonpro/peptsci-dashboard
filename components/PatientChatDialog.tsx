'use client'

/** Dark-themed modal wrapper around the patient message thread. */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PatientChat } from '@/components/PatientChat'
import { MessagesSquare } from 'lucide-react'

export function PatientChatDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  viewerRole,
  onRead,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  patientName: string
  viewerRole: 'CLINIC' | 'PEPTSCI'
  onRead?: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#0a0e3a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MessagesSquare className="h-5 w-5" /> Messages — {patientName}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {viewerRole === 'CLINIC'
              ? 'Chat with the PeptSci team about this patient.'
              : 'Chat with the clinic about this patient.'}
          </DialogDescription>
        </DialogHeader>
        {open && <PatientChat patientId={patientId} viewerRole={viewerRole} onRead={onRead} />}
      </DialogContent>
    </Dialog>
  )
}
