/**
 * Thin Shopify Admin GraphQL client for Custom App tokens.
 */

import { logger } from '@/lib/logger'
import { normalizeShopDomain } from './ids'

export type ShopifyGraphqlClientConfig = {
  shopDomain: string
  accessToken: string
  apiVersion?: string
}

export type ShopifyGraphqlError = {
  message: string
  extensions?: Record<string, unknown>
}

export class ShopifyApiError extends Error {
  readonly status: number
  readonly errors: ShopifyGraphqlError[]
  constructor(message: string, status: number, errors: ShopifyGraphqlError[] = []) {
    super(message)
    this.name = 'ShopifyApiError'
    this.status = status
    this.errors = errors
  }
}

export async function shopifyGraphql<T = unknown>(
  config: ShopifyGraphqlClientConfig,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const shop = normalizeShopDomain(config.shopDomain)
  const version = config.apiVersion || '2025-07'
  const url = `https://${shop}/admin/api/${version}/graphql.json`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = (await res.json().catch(() => ({}))) as {
    data?: T
    errors?: ShopifyGraphqlError[]
  }

  if (!res.ok) {
    logger.warn('[shopify] GraphQL HTTP error', {
      shop,
      status: res.status,
      errors: json.errors,
    })
    throw new ShopifyApiError(
      `Shopify GraphQL HTTP ${res.status}`,
      res.status,
      json.errors ?? []
    )
  }

  if (json.errors?.length) {
    throw new ShopifyApiError(json.errors[0]?.message || 'Shopify GraphQL error', 200, json.errors)
  }

  return json.data as T
}

const PRODUCT_VARIANTS_QUERY = `#graphql
  query ProductVariants($cursor: String) {
    productVariants(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        sku
        title
        product { title }
      }
    }
  }
`

export type ShopifyVariantNode = {
  id: string
  sku: string | null
  title: string | null
  displayName?: string | null
  product: { title: string } | null
}

export async function listShopifyProductVariants(
  config: ShopifyGraphqlClientConfig,
  opts: { maxPages?: number } = {}
): Promise<ShopifyVariantNode[]> {
  const maxPages = opts.maxPages ?? 20
  const out: ShopifyVariantNode[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page++) {
    type VariantsPage = {
      productVariants: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: ShopifyVariantNode[]
      }
    }
    const data: VariantsPage = await shopifyGraphql<VariantsPage>(
      config,
      PRODUCT_VARIANTS_QUERY,
      cursor ? { cursor } : {}
    )
    out.push(...(data.productVariants?.nodes ?? []))
    if (!data.productVariants?.pageInfo?.hasNextPage) break
    cursor = data.productVariants.pageInfo.endCursor
    if (!cursor) break
  }
  return out
}

const ORDER_FULFILLMENT_ORDERS_QUERY = `#graphql
  query OrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      name
      fulfillmentOrders(first: 10) {
        nodes {
          id
          status
          assignedLocation { name }
        }
      }
    }
  }
`

export async function getOrderFulfillmentOrderIds(
  config: ShopifyGraphqlClientConfig,
  orderGid: string
): Promise<string[]> {
  const data = await shopifyGraphql<{
    order: {
      id: string
      fulfillmentOrders: { nodes: Array<{ id: string; status: string }> }
    } | null
  }>(config, ORDER_FULFILLMENT_ORDERS_QUERY, { id: orderGid })

  return (data.order?.fulfillmentOrders?.nodes ?? [])
    .filter((n) => n.status !== 'CLOSED' && n.status !== 'CANCELLED')
    .map((n) => n.id)
}

const FULFILLMENT_CREATE = `#graphql
  mutation FulfillmentCreate($fulfillment: FulfillmentInput!, $message: String) {
    fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
      fulfillment {
        id
        status
        trackingInfo { company number url }
      }
      userErrors { field message }
    }
  }
`

export type FulfillmentCreateInput = {
  fulfillmentOrderId: string
  trackingCompany?: string | null
  trackingNumber: string
  trackingUrl?: string | null
  notifyCustomer?: boolean
  message?: string | null
}

export async function createShopifyFulfillment(
  config: ShopifyGraphqlClientConfig,
  input: FulfillmentCreateInput
): Promise<{ fulfillmentId: string | null; userErrors: Array<{ message: string }> }> {
  const data = await shopifyGraphql<{
    fulfillmentCreate: {
      fulfillment: { id: string } | null
      userErrors: Array<{ field: string[] | null; message: string }>
    }
  }>(config, FULFILLMENT_CREATE, {
    message: input.message ?? undefined,
    fulfillment: {
      notifyCustomer: input.notifyCustomer ?? true,
      trackingInfo: {
        company: input.trackingCompany || undefined,
        number: input.trackingNumber,
        url: input.trackingUrl || undefined,
      },
      lineItemsByFulfillmentOrder: [
        {
          fulfillmentOrderId: input.fulfillmentOrderId,
        },
      ],
    },
  })

  return {
    fulfillmentId: data.fulfillmentCreate?.fulfillment?.id ?? null,
    userErrors: data.fulfillmentCreate?.userErrors ?? [],
  }
}

const FULFILLMENT_TRACKING_UPDATE = `#graphql
  mutation FulfillmentTrackingInfoUpdate(
    $fulfillmentId: ID!
    $trackingInfoInput: FulfillmentTrackingInput!
    $notifyCustomer: Boolean
  ) {
    fulfillmentTrackingInfoUpdate(
      fulfillmentId: $fulfillmentId
      trackingInfoInput: $trackingInfoInput
      notifyCustomer: $notifyCustomer
    ) {
      fulfillment { id }
      userErrors { field message }
    }
  }
`

export async function updateShopifyFulfillmentTracking(
  config: ShopifyGraphqlClientConfig,
  input: {
    fulfillmentId: string
    trackingCompany?: string | null
    trackingNumber: string
    trackingUrl?: string | null
    notifyCustomer?: boolean
  }
): Promise<{ userErrors: Array<{ message: string }> }> {
  const data = await shopifyGraphql<{
    fulfillmentTrackingInfoUpdate: {
      fulfillment: { id: string } | null
      userErrors: Array<{ message: string }>
    }
  }>(config, FULFILLMENT_TRACKING_UPDATE, {
    fulfillmentId: input.fulfillmentId,
    notifyCustomer: input.notifyCustomer ?? true,
    trackingInfoInput: {
      company: input.trackingCompany || undefined,
      number: input.trackingNumber,
      url: input.trackingUrl || undefined,
    },
  })
  return { userErrors: data.fulfillmentTrackingInfoUpdate?.userErrors ?? [] }
}
