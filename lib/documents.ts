/**
 * Pure validation + expiry helpers for client compliance documents
 * (license / DEA / insurance / resale certificate uploads). No Prisma imports
 * so it unit-tests in isolation.
 */

export const DOCUMENT_TYPES = ['LICENSE', 'DEA', 'INSURANCE', 'RESALE_CERT', 'OTHER'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  LICENSE: 'Medical / Business License',
  DEA: 'DEA Registration',
  INSURANCE: 'Liability Insurance',
  RESALE_CERT: 'Resale Certificate',
  OTHER: 'Other',
}

export const ALLOWED_DOCUMENT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024 // 10MB

export type DocumentUploadValidation =
  | { ok: true; type: DocumentType }
  | { ok: false; code: 'BAD_TYPE' | 'BAD_MIME' | 'TOO_LARGE' | 'EMPTY'; message: string }

export function validateDocumentUpload(input: {
  type: string
  mime: string
  size: number
}): DocumentUploadValidation {
  if (!DOCUMENT_TYPES.includes(input.type as DocumentType)) {
    return { ok: false, code: 'BAD_TYPE', message: 'Unknown document type' }
  }
  if (!ALLOWED_DOCUMENT_MIME.includes(input.mime as (typeof ALLOWED_DOCUMENT_MIME)[number])) {
    return { ok: false, code: 'BAD_MIME', message: 'Upload a PDF, JPEG, PNG, or WebP file' }
  }
  if (input.size <= 0) {
    return { ok: false, code: 'EMPTY', message: 'The file is empty' }
  }
  if (input.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, code: 'TOO_LARGE', message: 'File must be 10MB or smaller' }
  }
  return { ok: true, type: input.type as DocumentType }
}

export type ExpiryState = 'valid' | 'expiring_soon' | 'expired'

const EXPIRING_SOON_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** Expiry bucket for badges + admin alerts. Null = no expiration tracked. */
export function documentExpiryState(expiresAt: Date | null, now: Date = new Date()): ExpiryState {
  if (!expiresAt) return 'valid'
  const diffDays = (expiresAt.getTime() - now.getTime()) / DAY_MS
  if (diffDays < 0) return 'expired'
  if (diffDays <= EXPIRING_SOON_DAYS) return 'expiring_soon'
  return 'valid'
}
