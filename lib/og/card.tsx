/**
 * Shared Open Graph card renderer — the branded 1200×630 preview image that
 * link scrapers (iMessage, WhatsApp, Slack, LinkedIn, X…) show when someone
 * shares a PeptSci link.
 *
 * Each audience-facing route segment has an `opengraph-image.tsx` that calls
 * `renderOgCard` with copy dedicated to that audience (clients, partners,
 * invitees…). Visuals match the auth/invite pages: onyx canvas, brand-blue
 * ambient glows, molecule icon + Sofia Pro wordmark.
 */
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

const ONYX = '#050722'
const PRIMARY = '#213cef'

// Same brand assets the rest of the app uses; read from disk (not fetched)
// so the image route has no network dependency. Literal process.cwd() joins
// keep the files in Vercel's output file trace (same pattern as the label
// PDF engine).
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'labels', 'SofiaPro-Regular.ttf')
const ICON_PATH = path.join(process.cwd(), 'public', 'brand', 'peptsci-icon-transparent.png')

async function loadAssets() {
  const [font, icon] = await Promise.all([readFile(FONT_PATH), readFile(ICON_PATH)])
  return { font, iconSrc: `data:image/png;base64,${icon.toString('base64')}` }
}

export interface OgCardProps {
  /** Small uppercase pill above the title, e.g. "Partner program". */
  eyebrow: string
  /** Main headline. Long titles auto-shrink to stay on the card. */
  title: string
  /** Supporting line under the title. */
  subtitle?: string
  /** Dot-separated trust badges along the bottom edge. */
  badges?: string[]
}

const DEFAULT_BADGES = ['COA-verified', 'Third-party tested', 'Licensed practices only']

export async function renderOgCard({
  eyebrow,
  title,
  subtitle,
  badges = DEFAULT_BADGES,
}: OgCardProps): Promise<ImageResponse> {
  const { font, iconSrc } = await loadAssets()
  // Personalized titles (inviter names) can run long — step the size down so
  // the headline never clips.
  const titleSize = title.length > 70 ? 48 : title.length > 44 ? 56 : 68

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundColor: ONYX,
          backgroundImage: [
            'radial-gradient(circle at 18% -10%, rgba(59, 42, 140, 0.60) 0%, rgba(59, 42, 140, 0) 55%)',
            'radial-gradient(circle at 88% 112%, rgba(33, 60, 239, 0.45) 0%, rgba(33, 60, 239, 0) 55%)',
            'radial-gradient(circle at 100% 0%, rgba(122, 91, 255, 0.25) 0%, rgba(122, 91, 255, 0) 45%)',
          ].join(', '),
          fontFamily: 'Sofia Pro',
          color: '#ffffff',
        }}
      >
        {/* Header: molecule icon + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" width={62} height={72} />
          <span style={{ fontSize: 46, letterSpacing: -1 }}>PeptSci</span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 22px',
              borderRadius: 999,
              border: `1px solid rgba(33, 60, 239, 0.55)`,
              backgroundColor: 'rgba(33, 60, 239, 0.16)',
              color: '#a5b4fc',
              fontSize: 21,
              letterSpacing: 4,
              textTransform: 'uppercase',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: PRIMARY,
              }}
            />
            {eyebrow}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              maxWidth: 980,
              fontSize: titleSize,
              lineHeight: 1.12,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                display: 'flex',
                marginTop: 22,
                maxWidth: 860,
                fontSize: 27,
                lineHeight: 1.4,
                color: 'rgba(255, 255, 255, 0.62)',
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* Footer: domain + trust badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 30,
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            fontSize: 22,
            color: 'rgba(255, 255, 255, 0.45)',
          }}
        >
          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>peptsci.com</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {badges.map((badge, i) => (
              <div key={badge} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {i > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    }}
                  />
                ) : null}
                {badge}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: 'Sofia Pro', data: font, weight: 400, style: 'normal' }],
    }
  )
}
