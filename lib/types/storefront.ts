export interface BrandingConfig {
  name: string
  logo?: string
  favicon?: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  fonts?: {
    heading?: string
    body?: string
  }
  hero?: {
    title: string
    subtitle?: string
    backgroundImage?: string
    cta?: string
  }
  footer?: {
    text?: string
    links?: { label: string; url: string }[]
  }
  about?: string
  contact?: {
    email?: string
    phone?: string
    address?: string
  }
  socials?: { platform: string; url: string }[]
}

export const DEFAULT_BRANDING: BrandingConfig = {
  name: 'My Store',
  colors: {
    primary: '#213cef',
    secondary: '#050722',
    accent: '#10b981',
    background: '#ffffff',
    text: '#111827',
  },
}

export interface StorefrontPublicConfig {
  id: string
  slug: string
  name: string
  branding: BrandingConfig
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED'
}

export interface StorefrontProductItem {
  id: string
  variantId: string
  productName: string
  displayName: string | null
  displayDescription: string | null
  sku: string | null
  dose: string | null
  unitSize: string | null
  category: string | null
  retailPrice: number | null
  compareAtPrice: number | null
  isFeatured: boolean
  displayOrder: number
  isEnabled: boolean
  inventoryOnHand: number
  media: { url: string; altText: string | null; isPrimary: boolean }[]
}

export interface RetailOrderSummary {
  id: string
  orderNumber: string
  status: string
  subtotal: number
  taxTotal: number
  shippingTotal: number
  total: number
  itemCount: number
  createdAt: string
  peptsciOrderId: string | null
}
