import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getStorefrontBySlug } from '@/lib/storefront'
import { StorefrontShell } from '@/components/storefront/StorefrontShell'

export const dynamic = 'force-dynamic'

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const slug = headersList.get('x-storefront-slug')

  if (!slug) return notFound()

  const config = await getStorefrontBySlug(slug)
  if (!config || config.status !== 'ACTIVE') return notFound()

  const branding = config.branding

  // Build CSS custom properties from branding colors
  const cssVars: Record<string, string> = {}
  if (branding.colors) {
    cssVars['--sf-primary'] = branding.colors.primary
    cssVars['--sf-secondary'] = branding.colors.secondary
    cssVars['--sf-accent'] = branding.colors.accent
    cssVars['--sf-background'] = branding.colors.background
    cssVars['--sf-text'] = branding.colors.text
  }

  // Dynamic Google Fonts link
  const fontFamilies: string[] = []
  if (branding.fonts?.heading) fontFamilies.push(branding.fonts.heading.replace(/ /g, '+'))
  if (branding.fonts?.body && branding.fonts.body !== branding.fonts.heading) {
    fontFamilies.push(branding.fonts.body.replace(/ /g, '+'))
  }
  const googleFontsUrl =
    fontFamilies.length > 0
      ? `https://fonts.googleapis.com/css2?${fontFamilies.map((f) => `family=${f}:wght@300;400;500;600;700`).join('&')}&display=swap`
      : null

  return (
    <html lang="en">
      <head>
        <title>{branding.name}</title>
        {branding.favicon && <link rel="icon" href={branding.favicon} />}
        {googleFontsUrl && <link rel="stylesheet" href={googleFontsUrl} />}
      </head>
      <body
        style={{
          ...cssVars,
          backgroundColor: branding.colors.background,
          color: branding.colors.text,
          fontFamily: branding.fonts?.body ? `"${branding.fonts.body}", sans-serif` : 'system-ui, sans-serif',
        } as React.CSSProperties}
        className="min-h-screen"
      >
        <StorefrontShell config={config} slug={slug}>
          {children}
        </StorefrontShell>
      </body>
    </html>
  )
}
