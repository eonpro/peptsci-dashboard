import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { logger } from './logger'
import { reserveForOrder } from './inventory/reservations'
import type { BrandingConfig, StorefrontProductItem, StorefrontPublicConfig } from './types/storefront'

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

const log = logger.child({ module: 'storefront' })

export async function getStorefrontBySlug(slug: string): Promise<StorefrontPublicConfig | null> {
  if (!prisma) return null

  try {
    const sf = await prisma.storefront.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        brandingConfig: true,
        status: true,
      },
    })

    if (!sf) return null

    return {
      id: sf.id,
      slug: sf.slug,
      name: sf.name,
      branding: (sf.brandingConfig as unknown as BrandingConfig) ?? {
        name: sf.name,
        colors: {
          primary: '#213cef',
          secondary: '#050722',
          accent: '#10b981',
          background: '#ffffff',
          text: '#111827',
        },
      },
      status: sf.status,
    }
  } catch (error) {
    log.error('Failed to load storefront', { slug }, error as Error)
    return null
  }
}

export async function getStorefrontById(id: string) {
  if (!prisma) return null

  return prisma.storefront.findUnique({
    where: { id },
    include: {
      client: {
        select: { organizationName: true, contactEmail: true },
      },
      _count: {
        select: { products: true, retailOrders: true, endCustomers: true },
      },
    },
  })
}

export async function listStorefronts(filters?: { status?: string; clientId?: string }) {
  if (!prisma) return []

  return prisma.storefront.findMany({
    where: {
      ...(filters?.status ? { status: filters.status as 'DRAFT' | 'ACTIVE' | 'SUSPENDED' } : {}),
      ...(filters?.clientId ? { clientId: filters.clientId } : {}),
    },
    include: {
      client: {
        select: { organizationName: true, contactEmail: true },
      },
      _count: {
        select: { products: true, retailOrders: true, endCustomers: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createStorefront(data: {
  clientId: string
  slug: string
  name: string
  brandingConfig?: BrandingConfig
}) {
  if (!prisma) throw new Error('Database not connected')

  const existing = await prisma.storefront.findUnique({ where: { slug: data.slug } })
  if (existing) throw new Error(`Slug "${data.slug}" is already taken`)

  return prisma.storefront.create({
    data: {
      clientId: data.clientId,
      slug: data.slug,
      name: data.name,
      brandingConfig: toJsonInput(data.brandingConfig),
      status: 'DRAFT',
    },
    include: {
      client: { select: { organizationName: true } },
    },
  })
}

export async function updateStorefront(
  id: string,
  data: {
    name?: string
    slug?: string
    brandingConfig?: BrandingConfig
    status?: 'DRAFT' | 'ACTIVE' | 'SUSPENDED'
  }
) {
  if (!prisma) throw new Error('Database not connected')

  if (data.slug) {
    const existing = await prisma.storefront.findUnique({ where: { slug: data.slug } })
    if (existing && existing.id !== id) throw new Error(`Slug "${data.slug}" is already taken`)
  }

  return prisma.storefront.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.brandingConfig !== undefined ? { brandingConfig: toJsonInput(data.brandingConfig) } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
    include: {
      client: { select: { organizationName: true } },
    },
  })
}

export async function deleteStorefront(id: string) {
  if (!prisma) throw new Error('Database not connected')
  return prisma.storefront.delete({ where: { id } })
}

// ── Storefront Products ──

export async function getStorefrontProducts(
  storefrontId: string,
  options?: { enabledOnly?: boolean; featuredOnly?: boolean }
): Promise<StorefrontProductItem[]> {
  if (!prisma) return []

  const products = await prisma.storefrontProduct.findMany({
    where: {
      storefrontId,
      ...(options?.enabledOnly ? { isEnabled: true } : {}),
      ...(options?.featuredOnly ? { isFeatured: true } : {}),
    },
    include: {
      variant: {
        include: {
          product: {
            include: { media: true },
          },
        },
      },
      retailPrice: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return products.map((p) => ({
    id: p.id,
    variantId: p.variantId,
    productName: p.variant.product.name,
    displayName: p.displayName,
    displayDescription: p.displayDescription,
    sku: p.variant.sku,
    dose: p.variant.dose,
    unitSize: p.variant.unitSize,
    category: p.variant.product.category,
    retailPrice: p.retailPrice ? Number(p.retailPrice.retailPrice) : null,
    compareAtPrice: p.retailPrice?.compareAtPrice ? Number(p.retailPrice.compareAtPrice) : null,
    isFeatured: p.isFeatured,
    displayOrder: p.displayOrder,
    isEnabled: p.isEnabled,
    inventoryOnHand: p.variant.inventoryOnHand,
    media: p.variant.product.media.map((m) => ({
      url: m.url,
      altText: m.altText,
      isPrimary: m.isPrimary,
    })),
  }))
}

export async function upsertStorefrontProduct(data: {
  storefrontId: string
  variantId: string
  isEnabled?: boolean
  isFeatured?: boolean
  displayOrder?: number
  displayName?: string | null
  displayDescription?: string | null
  retailPrice?: number
  compareAtPrice?: number | null
}) {
  if (!prisma) throw new Error('Database not connected')

  const sp = await prisma.storefrontProduct.upsert({
    where: {
      storefrontId_variantId: {
        storefrontId: data.storefrontId,
        variantId: data.variantId,
      },
    },
    update: {
      ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
      ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
      ...(data.displayOrder !== undefined ? { displayOrder: data.displayOrder } : {}),
      ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
      ...(data.displayDescription !== undefined
        ? { displayDescription: data.displayDescription }
        : {}),
    },
    create: {
      storefrontId: data.storefrontId,
      variantId: data.variantId,
      isEnabled: data.isEnabled ?? true,
      isFeatured: data.isFeatured ?? false,
      displayOrder: data.displayOrder ?? 0,
      displayName: data.displayName ?? null,
      displayDescription: data.displayDescription ?? null,
    },
  })

  if (data.retailPrice !== undefined) {
    await prisma.storefrontRetailPrice.upsert({
      where: { storefrontProductId: sp.id },
      update: {
        retailPrice: data.retailPrice,
        compareAtPrice: data.compareAtPrice ?? null,
        isActive: true,
      },
      create: {
        storefrontProductId: sp.id,
        retailPrice: data.retailPrice,
        compareAtPrice: data.compareAtPrice ?? null,
        isActive: true,
      },
    })
  }

  return sp
}

export async function removeStorefrontProduct(storefrontId: string, variantId: string) {
  if (!prisma) throw new Error('Database not connected')

  return prisma.storefrontProduct.delete({
    where: {
      storefrontId_variantId: { storefrontId, variantId },
    },
  })
}

// ── Retail Orders ──

export async function createRetailOrder(data: {
  storefrontId: string
  endCustomerId?: string
  guestEmail?: string
  shippingAddress?: Record<string, unknown>
  billingAddress?: Record<string, unknown>
  notes?: string
  items: { storefrontProductId: string; quantity: number; unitRetailPrice: number }[]
}) {
  if (!prisma) throw new Error('Database not connected')

  const storefront = await prisma.storefront.findUnique({
    where: { id: data.storefrontId },
    include: {
      client: {
        include: { users: { where: { role: 'CLIENT' }, take: 1 } },
      },
    },
  })
  if (!storefront) throw new Error('Storefront not found')
  if (storefront.status !== 'ACTIVE') throw new Error('Storefront is not active')

  const subtotal = data.items.reduce((sum, i) => sum + i.quantity * i.unitRetailPrice, 0)
  const taxTotal = Math.round(subtotal * 0.08 * 100) / 100
  const shippingTotal = subtotal > 500 ? 0 : 25
  const total = Math.round((subtotal + taxTotal + shippingTotal) * 100) / 100

  const count = await prisma.retailOrder.count({ where: { storefrontId: data.storefrontId } })
  const orderNumber = `SF-${storefront.slug}-${String(count + 1).padStart(5, '0')}`

  // Resolve the PeptSci cost for each item (ClientPricing or SRP)
  const sfProducts = await prisma.storefrontProduct.findMany({
    where: { id: { in: data.items.map((i) => i.storefrontProductId) } },
    include: {
      variant: {
        include: {
          clientPricing: {
            where: {
              clientId: storefront.clientId,
              isActive: true,
              OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
            },
          },
        },
      },
    },
  })
  const productMap = new Map(sfProducts.map((p) => [p.id, p]))

  const createdById = storefront.client.users[0]?.id
  if (!createdById) throw new Error('Clinic has no user to attribute the PeptSci order to')

  // Compute PeptSci-side totals using clinic's cost
  const peptsciItems = data.items.map((item) => {
    const sp = productMap.get(item.storefrontProductId)
    if (!sp) throw new Error(`StorefrontProduct ${item.storefrontProductId} not found`)
    const clientPrice = sp.variant.clientPricing[0]
    const unitPrice = clientPrice ? Number(clientPrice.customPrice) : Number(sp.variant.srp)
    return {
      variantId: sp.variantId,
      quantity: item.quantity,
      unitPrice,
      totalPrice: Math.round(item.quantity * unitPrice * 100) / 100,
      discountAmount: 0,
    }
  })
  const peptsciSubtotal = peptsciItems.reduce((s, i) => s + i.totalPrice, 0)
  const peptsciTotal = Math.round(peptsciSubtotal * 100) / 100

  const result = await prisma.$transaction(async (tx) => {
    const peptsciOrder = await tx.order.create({
      data: {
        clientId: storefront.clientId,
        source: 'STOREFRONT',
        status: 'SUBMITTED',
        paymentStatus: 'PENDING',
        subtotal: peptsciSubtotal,
        taxTotal: 0,
        total: peptsciTotal,
        notes: `Auto-generated from storefront order ${orderNumber}`,
        createdById,
        submittedAt: new Date(),
        items: {
          create: peptsciItems.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountAmount: i.discountAmount,
            totalPrice: i.totalPrice,
          })),
        },
      },
    })

    const retailOrder = await tx.retailOrder.create({
      data: {
        orderNumber,
        storefrontId: data.storefrontId,
        endCustomerId: data.endCustomerId,
        guestEmail: data.guestEmail,
        status: 'PENDING',
        subtotal,
        taxTotal,
        shippingTotal,
        total,
        shippingAddress: toJsonInput(data.shippingAddress),
        billingAddress: toJsonInput(data.billingAddress),
        notes: data.notes,
        peptsciOrderId: peptsciOrder.id,
        items: {
          create: data.items.map((i) => ({
            storefrontProductId: i.storefrontProductId,
            quantity: i.quantity,
            unitRetailPrice: i.unitRetailPrice,
            totalPrice: Math.round(i.quantity * i.unitRetailPrice * 100) / 100,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    return { retailOrder, peptsciOrder }
  })

  log.info('Retail order created', {
    orderNumber,
    storefrontId: data.storefrontId,
    peptsciOrderId: result.peptsciOrder.id,
    total,
  })

  // Reserve stock against the auto-generated PeptSci order. Non-blocking: a
  // reservation hiccup must not fail an otherwise-successful storefront order,
  // but it must NOT be silently swallowed either — retry once, then escalate to
  // an error log so ops can reconcile the un-reserved order (reserveForOrder is
  // idempotent, so the retry is safe).
  try {
    await reserveForOrder(result.peptsciOrder.id)
  } catch (firstErr) {
    log.warn('reserveForOrder failed; retrying once', {
      peptsciOrderId: result.peptsciOrder.id,
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    })
    try {
      await reserveForOrder(result.peptsciOrder.id)
    } catch (retryErr) {
      log.error(
        'reserveForOrder failed after retry — order has NO stock reservation; reconcile manually',
        {
          peptsciOrderId: result.peptsciOrder.id,
          orderNumber,
          error: retryErr instanceof Error ? retryErr.message : String(retryErr),
        }
      )
    }
  }

  return result
}

export async function getRetailOrders(
  storefrontId: string,
  options?: { endCustomerId?: string; limit?: number; offset?: number }
) {
  if (!prisma) return []

  return prisma.retailOrder.findMany({
    where: {
      storefrontId,
      ...(options?.endCustomerId ? { endCustomerId: options.endCustomerId } : {}),
    },
    include: {
      items: {
        include: {
          storefrontProduct: {
            include: {
              variant: {
                include: { product: { select: { name: true } } },
              },
            },
          },
        },
      },
      endCustomer: { select: { email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  })
}

export async function getRetailOrderById(orderId: string) {
  if (!prisma) return null

  return prisma.retailOrder.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          storefrontProduct: {
            include: {
              variant: {
                include: { product: { select: { name: true, category: true } } },
              },
            },
          },
        },
      },
      endCustomer: true,
      storefront: { select: { slug: true, name: true } },
      peptsciOrder: { select: { id: true, orderNumber: true, status: true } },
    },
  })
}
