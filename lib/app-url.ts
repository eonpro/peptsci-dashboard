/** Absolute URL builder for links in emails/notifications. */
const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

export function appUrl(path = '/'): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`
}
