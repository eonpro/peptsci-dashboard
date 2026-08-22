import {
  CATALOG_DISCLOSURE,
  CATALOG_YEAR,
} from '@/lib/catalog-book'
import { cn } from '@/lib/utils'

export function BookDisclaimer({ light = false }: { light?: boolean }) {
  return (
    <p
      className={cn(
        'text-[9px] font-medium uppercase leading-relaxed tracking-wide sm:text-[10px]',
        light ? 'text-black/45' : 'text-white/45'
      )}
    >
      {CATALOG_DISCLOSURE}
    </p>
  )
}

export function BookCopyright({ light = false }: { light?: boolean }) {
  return (
    <p
      className={cn(
        'text-[10px] font-medium tracking-wide',
        light ? 'text-black/40' : 'text-white/40'
      )}
    >
      ©{CATALOG_YEAR} All rights reserved PeptSci
    </p>
  )
}
