/** Zod schema + serializer for saved patients (ship-to recipients). */
import { z } from 'zod'
import { addressSchema, type Address } from './address'

export const patientCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(120),
  lastName: z.string().trim().min(1, 'Last name is required').max(120),
  address: addressSchema,
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
})

export const patientUpdateSchema = patientCreateSchema.partial()

export type PatientInput = z.infer<typeof patientCreateSchema>

export interface SerializedPatient {
  id: string
  firstName: string
  lastName: string
  address: Address
  phone: string | null
  email: string | null
  notes: string | null
}

export function serializePatient(p: {
  id: string
  firstName: string
  lastName: string
  address: unknown
  phone: string | null
  email: string | null
  notes: string | null
}): SerializedPatient {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    address: p.address as Address,
    phone: p.phone,
    email: p.email,
    notes: p.notes,
  }
}
