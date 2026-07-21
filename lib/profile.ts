/**
 * Shared Zod schemas + serializer for the practice profile (the `Client`
 * record). Used by onboarding, client self-edit, and the admin clients API so
 * validation stays in one place.
 */
import { z } from 'zod'
import { addressSchema, type Address } from './address'
import { isValidNpi, cleanNpi, isNpiBypass, NPI_BYPASS } from './npi'

const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(30)

export const npiSchema = z
  .string()
  .trim()
  .transform(cleanNpi)
  .refine((v) => isValidNpi(v), { message: 'Enter a valid 10-digit NPI number' })

/**
 * Onboarding-only NPI: a real NPPES-valid NPI, or the all-zeros bypass for
 * non-providers (normalized to NPI_BYPASS; the API stores null for those).
 */
export const onboardingNpiSchema = z
  .string()
  .trim()
  .transform(cleanNpi)
  .refine((v) => isValidNpi(v) || isNpiBypass(v), {
    message: 'Enter a valid 10-digit NPI number, or 000000000 if you are not a provider',
  })
  .transform((v) => (isNpiBypass(v) ? NPI_BYPASS : v))

/** Optional EIN / tax ID. Digits with optional hyphen; blank clears. */
export const einSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d-]/g, ''))
  .refine((v) => v === '' || /^\d{2}-?\d{7}$/.test(v), {
    message: 'Enter a valid EIN (XX-XXXXXXX)',
  })
  .transform((v) => {
    if (!v) return ''
    const digits = v.replace(/\D/g, '')
    return `${digits.slice(0, 2)}-${digits.slice(2)}`
  })

/** Contact + practice fields common to onboarding and profile editing. */
const contactFields = {
  organizationName: z.string().trim().min(2, 'Practice name is required').max(200),
  contactName: z.string().trim().min(2, 'Contact name is required').max(120),
  contactEmail: z.string().trim().email('Enter a valid email').max(200),
  contactPhone: phoneSchema,
}

/** Full onboarding payload: NPI + practice + addresses + contact. */
export const onboardingSchema = z
  .object({
    npiNumber: onboardingNpiSchema,
    // Required unless the caller used the non-provider NPI bypass (see superRefine).
    providerName: z.string().trim().max(200).optional().default(''),
    ...contactFields,
    billingAddress: addressSchema,
    shippingSameAsBilling: z.boolean().optional().default(false),
    shippingAddress: addressSchema.optional(),
    npiData: z.unknown().optional(),
    // TCPA/A2P SMS consent — must default to false (checkbox is never pre-checked).
    smsOptIn: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.npiNumber !== NPI_BYPASS && data.providerName.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providerName'],
        message: 'Provider name is required',
      })
    }
  })

export type OnboardingInput = z.infer<typeof onboardingSchema>

/** Client self-edit: contact + addresses (NPI/practice may be locked — see route). */
export const profileUpdateSchema = z.object({
  organizationName: contactFields.organizationName.optional(),
  providerName: z.string().trim().min(2).max(200).optional(),
  npiNumber: npiSchema.optional(),
  ein: einSchema.optional(),
  contactName: contactFields.contactName.optional(),
  contactEmail: contactFields.contactEmail.optional(),
  contactPhone: phoneSchema.optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  // TCPA: clients may grant or withdraw SMS consent from their account page.
  smsOptIn: z.boolean().optional(),
})

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

/** Resolve the effective shipping address from an onboarding payload. */
export function resolveShippingAddress(input: OnboardingInput): Address {
  if (input.shippingSameAsBilling || !input.shippingAddress) {
    return input.billingAddress
  }
  return input.shippingAddress
}

export interface ClientProfile {
  id: string
  organizationName: string
  npiNumber: string | null
  providerName: string | null
  ein: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  billingAddress: Address | null
  shippingAddress: Address | null
  onboardingStatus: string
  npiLocked: boolean
  /** Net-terms billing (admin-managed). Null = card-only checkout. */
  paymentTermsDays: number | null
  creditLimit: number | null
  /** TCPA SMS consent (null when the caller didn't select it). */
  smsOptIn: boolean | null
}

/**
 * Serialize a Prisma Client row into the profile shape the UI consumes.
 * `npiLocked` is true once the account is approved (NPI/practice are read-only
 * to the client and require an admin to change).
 */
export function serializeClientProfile(client: {
  id: string
  organizationName: string
  npiNumber: string | null
  providerName: string | null
  ein?: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  billingAddress: unknown
  shippingAddress: unknown
  onboardingStatus: string
  paymentTermsDays?: number | null
  creditLimit?: unknown
  smsOptIn?: boolean
}): ClientProfile {
  return {
    id: client.id,
    organizationName: client.organizationName,
    npiNumber: client.npiNumber,
    providerName: client.providerName,
    ein: client.ein ?? null,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    contactPhone: client.contactPhone,
    billingAddress: (client.billingAddress as Address | null) ?? null,
    shippingAddress: (client.shippingAddress as Address | null) ?? null,
    onboardingStatus: client.onboardingStatus,
    npiLocked: client.onboardingStatus === 'APPROVED',
    paymentTermsDays: client.paymentTermsDays ?? null,
    creditLimit: client.creditLimit != null ? Number(client.creditLimit) : null,
    smsOptIn: client.smsOptIn ?? null,
  }
}
