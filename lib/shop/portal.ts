/**
 * Clinic portal information architecture — one place for nav, SLA copy,
 * footer, and account shortcuts so the shop does not drift back to eight
 * competing top-level destinations.
 */

export const ACCOUNT_REVIEW_SLA = '1–2 business days'

export const SUPPORT_EMAIL = 'support@peptsci.com'

export type ShopNavItem = {
  name: string
  href: string
  exact?: boolean
}

/** Desktop primary nav. Everything else lives under Account. */
export const SHOP_PRIMARY_NAV: readonly ShopNavItem[] = [
  { name: 'Products', href: '/shop', exact: true },
  { name: 'Orders', href: '/shop/orders' },
  { name: 'Invoices', href: '/shop/invoices' },
  { name: 'Account', href: '/shop/account' },
]

export type ShopAccountLink = {
  name: string
  href: string
  description: string
}

/** Ordered for mobile: billing and help before extras. */
export const SHOP_ACCOUNT_LINKS: readonly ShopAccountLink[] = [
  {
    name: 'Invoices',
    href: '/shop/invoices',
    description: 'Pay balances and download statements',
  },
  {
    name: 'Support',
    href: '/shop/support',
    description: 'Tickets, shipping, returns, and FAQs',
  },
  {
    name: 'Patients',
    href: '/shop/patients',
    description: 'Ship-to recipients and their order history',
  },
  {
    name: 'Certificates of Analysis',
    href: '/shop/coas',
    description: 'Published COAs by product',
  },
  {
    name: 'Share lookbook',
    href: '/catalog',
    description: 'List-price catalog you can send to a colleague',
  },
  {
    name: 'Resources',
    href: '/shop/resources',
    description: 'Protocols and education',
  },
  {
    name: 'Refer & Earn',
    href: '/shop/referrals',
    description: 'Share PeptSci with another practice',
  },
  {
    name: 'Storefront',
    href: '/shop/storefront-manage',
    description: 'White-label shop for your patients',
  },
]

export type ShopMobileNavItem = {
  href: string
  label: string
  exact?: boolean
  action?: 'search' | 'cart'
}

export const SHOP_MOBILE_NAV: readonly ShopMobileNavItem[] = [
  { href: '/shop', label: 'Shop', exact: true },
  { href: '/shop#search', label: 'Search', action: 'search' },
  { href: '#cart', label: 'Cart', action: 'cart' },
  { href: '/shop/orders', label: 'Orders' },
  { href: '/shop/account', label: 'Account' },
]

export type FooterLink = { name: string; href: string }

export const SHOP_FOOTER = {
  email: SUPPORT_EMAIL,
  hours: 'Mon–Fri 9am–5pm PT',
  quick: [
    { name: 'Browse products', href: '/shop' },
    { name: 'Track a shipment', href: '/tracking' },
    { name: 'Share lookbook', href: '/catalog' },
  ] as const satisfies readonly FooterLink[],
  support: [
    { name: 'Help & FAQ', href: '/shop/support' },
    { name: 'Shipping', href: '/shipping' },
    { name: 'Returns', href: '/shop/support#returns' },
  ] as const satisfies readonly FooterLink[],
  legal: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/termsandconditions' },
  ] as const satisfies readonly FooterLink[],
}

export const ONBOARDING_STEPS = ['NPI', 'Practice', 'Billing', 'Shipping'] as const

export type OnboardingFields = {
  npi: string
  org: string
  contactName: string
  email: string
  phone: string
  billingZip: string
  shippingSame: boolean
  shippingZip: string
}

/** How many of the four onboarding steps have enough data to count as done. */
export function completedOnboardingSteps(fields: OnboardingFields): number {
  let done = 0
  if (fields.npi.replace(/\D/g, '').length >= 9) done += 1
  const practiceReady =
    fields.org.trim().length >= 2 &&
    fields.contactName.trim().length >= 2 &&
    fields.email.includes('@') &&
    fields.phone.trim().length >= 7
  if (practiceReady) done += 1
  if ((fields.billingZip ?? '').replace(/\D/g, '').length >= 5) done += 1
  const shippingReady =
    fields.shippingSame || (fields.shippingZip ?? '').replace(/\D/g, '').length >= 5
  if (shippingReady) done += 1
  return done
}

export type CoaLibraryProduct = {
  name: string
  sku: string
  hasCoa?: boolean
}

export function productsWithPublishedCoa(
  products: readonly CoaLibraryProduct[]
): Array<{ name: string; sku: string; href: string }> {
  return products
    .filter((p) => p.hasCoa && p.sku)
    .map((p) => ({
      name: p.name,
      sku: p.sku,
      href: `/shop/product/${encodeURIComponent(p.sku)}`,
    }))
}

export const SHOP_FAQS: readonly { question: string; answer: string; id?: string }[] = [
  {
    question: 'How long does account approval take?',
    answer: `We review new practices within ${ACCOUNT_REVIEW_SLA}. You will get an email as soon as you can place an order.`,
  },
  {
    question: 'Where do I pay an invoice?',
    answer: 'Open Account → Invoices, or Invoices in the top nav on desktop. You can pay a balance or download a statement there.',
  },
  {
    question: 'How do I track a shipment?',
    answer: 'Use Orders for packages tied to your login. If you only have a tracking number from an email, open Track a shipment in the footer (/tracking).',
  },
  {
    id: 'returns',
    question: 'How do I start a return?',
    answer: 'Open the order under Orders and choose Request return. Our team reviews research-use returns case by case. Email support@peptsci.com if you cannot find the order.',
  },
  {
    question: 'Where are Certificates of Analysis?',
    answer: 'Each product card and product page links a published COA. Account → Certificates of Analysis lists every lot we have posted.',
  },
]
