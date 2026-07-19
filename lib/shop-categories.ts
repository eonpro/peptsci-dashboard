/**
 * Merchandising categories for the shop.
 *
 * The catalog's raw `category` field carries scientific classifications
 * ("Cyclic heptapeptide", "GHRH analog with a GHS-R1a agonist", …) — precise,
 * but useless as storefront navigation. This maps every raw category (and,
 * as a fallback, the product name) onto a small, stable set of buyer-intent
 * buckets that clinicians actually shop by.
 */

import type { ShopProduct } from '@/lib/types/shop'

/** Display order for the storefront category chips/filters. */
export const SHOP_CATEGORY_ORDER = [
  'Weight Loss',
  'Growth Hormone',
  'Recovery & Repair',
  'Longevity',
  'Cognitive',
  'Skin & Beauty',
  'Wellness',
  'Specialty',
] as const

export type ShopCategoryBucket = (typeof SHOP_CATEGORY_ORDER)[number]

// Checked in order — first match wins. Keyword sets favor the raw category
// string but also catch well-known compound names when the category is vague.
const RULES: { bucket: ShopCategoryBucket; pattern: RegExp }[] = [
  {
    bucket: 'Weight Loss',
    pattern:
      /weight|glp-?1|glp\b|incretin|semaglutide|tirzepatide|retatrutide|cagrilintide|amylin|dual agonist|triple agonist|aod|lipotropic/i,
  },
  {
    bucket: 'Growth Hormone',
    pattern:
      /growth hormone|ghrh|ghs|secretagogue|sermorelin|tesamorelin|ipamorelin|cjc|hexarelin|mk-?677|igf/i,
  },
  {
    bucket: 'Recovery & Repair',
    pattern: /recovery|inflammation|repair|healing|bpc|tb-?500|thymosin beta|muscle|kpv|arod/i,
  },
  {
    bucket: 'Longevity',
    pattern:
      /longevity|anti-?aging|mitochond|nad|mots-?c|humanin|epithalon|epitalon|ss-?31|telomer|foxo/i,
  },
  {
    bucket: 'Cognitive',
    pattern: /nootropic|cognitive|cerebrolysin|semax|selank|dihexa|noopept|brain/i,
  },
  {
    bucket: 'Skin & Beauty',
    pattern: /skin|beauty|cosmetic|ghk|melanotan|melanocortin|tanning|collagen|snap-?8/i,
  },
  {
    bucket: 'Wellness',
    pattern:
      /wellness|immune|antimicrobial|thymosin alpha|ta-?1|libido|pt-?141|bremelanotide|kisspeptin|oxytocin|glutathione|vitamin|sleep|dsip/i,
  },
]

/** Map a raw catalog category (+ product name fallback) to its bucket. */
export function bucketForProduct(category: string | null | undefined, name?: string): ShopCategoryBucket {
  const haystacks = [category ?? '', name ?? '']
  for (const rule of RULES) {
    if (haystacks.some((h) => h && rule.pattern.test(h))) return rule.bucket
  }
  return 'Specialty'
}

/** Ordered list of buckets that actually contain products. */
export function getShopCategoryBuckets(products: ShopProduct[]): string[] {
  const present = new Set(products.map((p) => bucketForProduct(p.category, p.name)))
  return SHOP_CATEGORY_ORDER.filter((b) => present.has(b))
}
