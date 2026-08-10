/**
 * Pull paid Shopify orders via Admin GraphQL and ingest into PeptSci.
 */

import { decryptSecret } from './crypto'
import { listShopifyOrders, type ShopifyGraphqlClientConfig, type ShopifyGraphqlOrderNode } from './client'
import { ingestShopifyPaidOrder, type IngestShopifyOrderResult, type ShopifyOrderPayload } from './ingest-order'
import { shopifyGidToNumeric } from './ids'

function mapAddress(
  addr: ShopifyGraphqlOrderNode['shippingAddress']
): ShopifyOrderPayload['shipping_address'] {
  if (!addr) return null
  return {
    first_name: addr.firstName,
    last_name: addr.lastName,
    name: addr.name,
    company: addr.company,
    address1: addr.address1,
    address2: addr.address2,
    city: addr.city,
    province: addr.province,
    province_code: addr.provinceCode,
    zip: addr.zip,
    country: addr.country,
    country_code: addr.countryCodeV2,
    phone: addr.phone,
  }
}

/** Convert GraphQL order node → REST-shaped payload for ingestShopifyPaidOrder. */
export function graphqlOrderToIngestPayload(order: ShopifyGraphqlOrderNode): ShopifyOrderPayload {
  const financial = (order.displayFinancialStatus || '').toLowerCase()
  return {
    id: shopifyGidToNumeric(order.id) || order.id,
    admin_graphql_api_id: order.id,
    name: order.name,
    email: order.email,
    phone: order.phone,
    note: order.note,
    cancelled_at: order.cancelledAt,
    financial_status: financial === 'paid' || financial === 'partially_paid' ? 'paid' : financial,
    shipping_address: mapAddress(order.shippingAddress),
    billing_address: mapAddress(order.billingAddress),
    shipping_lines: order.shippingLine
      ? [{ title: order.shippingLine.title, code: order.shippingLine.code }]
      : [],
    line_items: (order.lineItems?.nodes ?? []).map((li) => ({
      variant_id: shopifyGidToNumeric(li.variant?.id) || li.variant?.id || null,
      sku: li.sku || li.variant?.sku || null,
      title: li.title || li.name || li.variant?.title || null,
      name: li.name || li.title || null,
      quantity: li.quantity,
      requires_shipping: li.requiresShipping,
    })),
    fulfillment_orders: (order.fulfillmentOrders?.nodes ?? []).map((fo) => ({
      admin_graphql_api_id: fo.id,
      id: shopifyGidToNumeric(fo.id) || fo.id,
    })),
  }
}

export type PullShopifyOrdersResult = {
  queried: number
  results: Array<{
    shopifyOrderName: string
    shopifyOrderId: string
    ingest: IngestShopifyOrderResult
  }>
}

export async function pullAndIngestShopifyOrders(params: {
  connection: {
    id: string
    clientId: string
    shopDomain: string
    accessToken: string
    apiVersion: string
  }
  /** Shopify order search query. Default: paid orders since ~3 days ago. */
  query?: string
  /** Optional exact order name e.g. "#1042" or "1042". */
  orderName?: string | null
  sinceDays?: number
}): Promise<PullShopifyOrdersResult> {
  const sinceDays = params.sinceDays ?? 3
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - sinceDays)
  const sinceStr = since.toISOString().slice(0, 10)

  let query = params.query
  if (!query) {
    if (params.orderName?.trim()) {
      const name = params.orderName.trim().startsWith('#')
        ? params.orderName.trim()
        : `#${params.orderName.trim()}`
      query = `name:${name} financial_status:paid`
    } else {
      query = `financial_status:paid created_at:>=${sinceStr}`
    }
  }

  const config: ShopifyGraphqlClientConfig = {
    shopDomain: params.connection.shopDomain,
    accessToken: decryptSecret(params.connection.accessToken),
    apiVersion: params.connection.apiVersion,
  }

  const orders = await listShopifyOrders(config, { query, maxPages: 4 })
  const results: PullShopifyOrdersResult['results'] = []

  for (const order of orders) {
    const status = (order.displayFinancialStatus || '').toUpperCase()
    if (status !== 'PAID' && status !== 'PARTIALLY_PAID') continue
    if (order.cancelledAt) continue

    const payload = graphqlOrderToIngestPayload(order)
    const ingest = await ingestShopifyPaidOrder({
      connectionId: params.connection.id,
      clientId: params.connection.clientId,
      payload,
    })
    results.push({
      shopifyOrderName: order.name,
      shopifyOrderId: shopifyGidToNumeric(order.id) || order.id,
      ingest,
    })
  }

  return { queried: orders.length, results }
}
