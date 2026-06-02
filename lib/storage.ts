/**
 * Storage abstraction for binary artifacts (FedEx label PDFs, package photos).
 *
 * Two backends, chosen at runtime:
 *  - 'blob'  : Vercel Blob, used when BLOB_READ_WRITE_TOKEN is set and the
 *              @vercel/blob package is available. Returns a public-ish URL we
 *              keep private by proxying through an auth-gated route.
 *  - 'inline': base64 stored directly on the DB row. Zero infra; the default
 *              fallback so the feature works locally and on prod out of the box.
 *
 * Switch backends by setting BLOB_READ_WRITE_TOKEN — no code change required.
 * Server-only.
 */

import { logger } from './logger'

export type StorageDriver = 'blob' | 'inline'

export type PutResult = {
  driver: StorageDriver
  /** Set when driver === 'blob' */
  url?: string
  /** Set when driver === 'inline' */
  base64?: string
  contentType: string
}

export type StoredRef = {
  /** Blob URL (driver 'blob') */
  url?: string | null
  /** base64 payload (driver 'inline') */
  base64?: string | null
  contentType?: string | null
}

function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

export function storageDriver(): StorageDriver {
  return blobEnabled() ? 'blob' : 'inline'
}

/**
 * Store a binary buffer. Returns the driver used + the reference to persist.
 * Falls back to inline base64 if the blob upload fails for any reason.
 */
export async function putObject(
  key: string,
  data: Buffer,
  contentType: string
): Promise<PutResult> {
  if (blobEnabled()) {
    try {
      const { put } = await import('@vercel/blob')
      const blob = await put(key, data, {
        access: 'public',
        contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: true,
      })
      return { driver: 'blob', url: blob.url, contentType }
    } catch (err) {
      logger.warn('[storage] Vercel Blob upload failed, falling back to inline base64', {
        key,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { driver: 'inline', base64: data.toString('base64'), contentType }
}

/**
 * Read a stored object back into a Buffer for server-side proxying/streaming.
 * Returns null when nothing is stored.
 */
export async function getObject(ref: StoredRef): Promise<{ data: Buffer; contentType: string } | null> {
  const contentType = ref.contentType || 'application/octet-stream'
  if (ref.url) {
    try {
      const res = await fetch(ref.url, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) {
        logger.warn('[storage] blob fetch failed', { status: res.status })
        return null
      }
      const buf = Buffer.from(await res.arrayBuffer())
      return { data: buf, contentType: res.headers.get('content-type') || contentType }
    } catch (err) {
      logger.warn('[storage] blob fetch error', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }
  if (ref.base64) {
    return { data: Buffer.from(ref.base64, 'base64'), contentType }
  }
  return null
}

/**
 * Delete a stored object (best-effort; inline refs are deleted by removing the
 * row). Only blob URLs are actively removed.
 */
export async function deleteObject(ref: StoredRef): Promise<void> {
  if (ref.url && blobEnabled()) {
    try {
      const { del } = await import('@vercel/blob')
      await del(ref.url, { token: process.env.BLOB_READ_WRITE_TOKEN })
    } catch (err) {
      logger.warn('[storage] blob delete failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
