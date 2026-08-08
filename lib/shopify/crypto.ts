/**
 * AES-256-GCM helpers for Shopify access tokens / webhook secrets at rest.
 * Key: SHOPIFY_TOKEN_ENCRYPTION_KEY — 32-byte secret as 64 hex chars (or any
 * utf8 string hashed to 32 bytes via SHA-256 when not hex).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function resolveKey(): Buffer {
  const raw = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new Error('SHOPIFY_TOKEN_ENCRYPTION_KEY is not configured')
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw, 'utf8').digest()
}

/** Encrypt plaintext → `ivHex:tagHex:cipherHex`. */
export function encryptSecret(plaintext: string): string {
  const key = resolveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/** Decrypt `ivHex:tagHex:cipherHex` → plaintext. */
export function decryptSecret(payload: string): string {
  const key = resolveKey()
  const parts = payload.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format')
  }
  const [ivHex, tagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim())
}
