/**
 * Persist a clinic Patient (ship-to recipient). Used by shop checkout,
 * admin New Order, and the clinic patients list.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { serializePatient, type PatientInput, type SerializedPatient } from '@/lib/patient'

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  address: true,
  phone: true,
  email: true,
  notes: true,
} as const

export async function createPatientForClient(
  clientId: string,
  input: PatientInput,
  notesFallback?: string | null
): Promise<SerializedPatient> {
  if (!prisma) throw new Error('Database not connected')

  const patient = await prisma.patient.create({
    data: {
      clientId,
      firstName: input.firstName,
      lastName: input.lastName,
      address: input.address as unknown as Prisma.InputJsonValue,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes || notesFallback || null,
    },
    select: patientSelect,
  })
  return serializePatient(patient)
}
