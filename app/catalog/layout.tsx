import type { Metadata, Viewport } from 'next'
import { ThemeScope } from '@/components/ThemeScope'

export const viewport: Viewport = {
  themeColor: '#050722',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: '2026 Research Product Catalog | PeptSci',
  description:
    'Shareable visual catalog of currently offered PeptSci research peptides. List prices; practice pricing after account approval. Research use only.',
  robots: { index: false, follow: false },
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-dvh bg-brand-onyx font-sofia text-white">
      <ThemeScope theme="dark" />
      {children}
    </div>
  )
}
