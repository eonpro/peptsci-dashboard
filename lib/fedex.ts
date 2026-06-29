/**
 * FedEx Ship + Rate API client.
 *
 * Ported from the EonPro integration (logosrx.eonpro.io) and adapted for
 * PeptSci's single-tenant B2B model:
 *  - Credentials come from environment variables only (no per-clinic resolution).
 *  - PHI encryption / HIPAA adapters dropped (B2B, no patient health data).
 *  - EonPro's opossum circuit-breaker replaced with a lightweight timeout+retry.
 *
 * Server-only: never import from a client component.
 */

import { logger } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FedExCredentials = {
  clientId: string
  clientSecret: string
  accountNumber: string
}

export type FedExEnvironment = 'sandbox' | 'production'

export type FedExAddress = {
  personName: string
  companyName?: string
  phoneNumber: string
  address1: string
  address2?: string | null
  city: string
  state: string
  zip: string
  countryCode?: string
  residential?: boolean
}

export type FedExPackageDetails = {
  weightLbs: number
  length?: number
  width?: number
  height?: number
}

export type LabelFormat = 'PDF' | 'ZPLII' | 'PNG'

export type CreateShipmentInput = {
  serviceType: string
  packagingType: string
  shipper: FedExAddress
  recipient: FedExAddress
  packages: FedExPackageDetails[]
  shipDate?: string // YYYY-MM-DD, defaults to today (America/New_York)
  oneRate?: boolean
  labelFormat?: LabelFormat
}

export type CreateShipmentResult = {
  trackingNumber: string
  shipmentId: string
  serviceType: string
  labelPdfBase64: string
  labelFormat: LabelFormat
}

export type RateQuoteInput = {
  serviceType: string
  packagingType: string
  shipper: FedExAddress
  recipient: FedExAddress
  packages: FedExPackageDetails[]
  oneRate?: boolean
}

export type RateQuoteResult = {
  serviceType: string
  serviceName: string
  totalCharge: number
  currency: string
  surcharges: { type: string; description: string; amount: number }[]
  transitDays: string | null
}

// ---------------------------------------------------------------------------
// Environment & configuration
// ---------------------------------------------------------------------------

const FEDEX_API_BASE =
  process.env.FEDEX_SANDBOX === 'true'
    ? 'https://apis-sandbox.fedex.com'
    : 'https://apis.fedex.com'

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before expiry
const REQUEST_TIMEOUT_MS = 30000
const MAX_RETRIES = 2

export function fedexEnvironment(): FedExEnvironment {
  return process.env.FEDEX_SANDBOX === 'true' ? 'sandbox' : 'production'
}

/**
 * Resolve FedEx API credentials from the environment.
 * Returns null when not fully configured (caller decides how to degrade).
 */
export function getCredentials(): FedExCredentials | null {
  const clientId = process.env.FEDEX_CLIENT_ID
  const clientSecret = process.env.FEDEX_CLIENT_SECRET
  const accountNumber = process.env.FEDEX_ACCOUNT_NUMBER
  if (!clientId || !clientSecret || !accountNumber) return null
  return { clientId, clientSecret, accountNumber }
}

export function isFedExConfigured(): boolean {
  return getCredentials() !== null
}

/**
 * Like getCredentials but throws a descriptive error when unconfigured.
 */
export function requireCredentials(): FedExCredentials {
  const creds = getCredentials()
  if (!creds) {
    throw new Error(
      'FedEx credentials not configured. Set FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET, and FEDEX_ACCOUNT_NUMBER.'
    )
  }
  return creds
}

/**
 * Default ship-from origin. Overridable via FEDEX_ORIGIN_* env vars. Defaults
 * to the Logos RX Tampa fulfillment address (matches the EonPro reference).
 */
export function getOriginAddress(): FedExAddress {
  return {
    personName: process.env.FEDEX_ORIGIN_NAME || 'Logos RX',
    companyName: process.env.FEDEX_ORIGIN_COMPANY || undefined,
    phoneNumber: process.env.FEDEX_ORIGIN_PHONE || '8138862800',
    address1: process.env.FEDEX_ORIGIN_ADDRESS1 || '7543 West Waters Avenue',
    address2: process.env.FEDEX_ORIGIN_ADDRESS2 || '',
    city: process.env.FEDEX_ORIGIN_CITY || 'Tampa',
    state: process.env.FEDEX_ORIGIN_STATE || 'FL',
    zip: process.env.FEDEX_ORIGIN_ZIP || '33615',
    countryCode: process.env.FEDEX_ORIGIN_COUNTRY || 'US',
  }
}

// ---------------------------------------------------------------------------
// OAuth2 token management (cached per clientId)
// ---------------------------------------------------------------------------

type TokenEntry = { accessToken: string; expiresAt: number }
const tokenCache = new Map<string, TokenEntry>()

async function getAccessToken(credentials: FedExCredentials): Promise<string> {
  const cacheKey = credentials.clientId
  const cached = tokenCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cached.accessToken
  }

  const response = await fetch(`${FEDEX_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('FedEx OAuth token request failed', {
      status: response.status,
      error: errorText.slice(0, 300),
    })
    throw new Error(`FedEx OAuth failed: ${response.status}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  })
  return data.access_token
}

// ---------------------------------------------------------------------------
// Low-level request helper with timeout + retry on transient failures
// ---------------------------------------------------------------------------

async function fedexRequest<T>(
  credentials: FedExCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const token = await getAccessToken(credentials)
      const response = await fetch(`${FEDEX_API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        // Retry only on 5xx / 429 — client errors (4xx) are deterministic.
        if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
          lastError = new Error(`FedEx API error: ${response.status}`)
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
          continue
        }
        logger.error('FedEx API error', {
          status: response.status,
          path,
          error: errorBody.slice(0, 500),
        })
        throw new Error(`FedEx API error: ${response.status} - ${errorBody.slice(0, 200)}`)
      }

      return (await response.json()) as T
    } catch (err) {
      lastError = err
      const isTimeout = err instanceof Error && err.name === 'TimeoutError'
      if (isTimeout && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('FedEx request failed')
}

// ---------------------------------------------------------------------------
// Payload builders (exported for unit testing)
// ---------------------------------------------------------------------------

function getTodayInTimezone(tz: string = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function buildShipmentPayload(credentials: FedExCredentials, input: CreateShipmentInput) {
  const shipDate = input.shipDate || getTodayInTimezone()

  return {
    labelResponseOptions: 'LABEL',
    accountNumber: { value: credentials.accountNumber },
    requestedShipment: {
      shipper: {
        contact: {
          personName: input.shipper.personName,
          ...(input.shipper.companyName && { companyName: input.shipper.companyName }),
          phoneNumber: input.shipper.phoneNumber.replace(/\D/g, ''),
        },
        address: {
          streetLines: [
            input.shipper.address1,
            ...(input.shipper.address2 ? [input.shipper.address2] : []),
          ],
          city: input.shipper.city,
          stateOrProvinceCode: input.shipper.state,
          postalCode: input.shipper.zip,
          countryCode: input.shipper.countryCode || 'US',
        },
      },
      recipients: [
        {
          contact: {
            personName: input.recipient.personName,
            ...(input.recipient.companyName && { companyName: input.recipient.companyName }),
            phoneNumber: input.recipient.phoneNumber.replace(/\D/g, ''),
          },
          address: {
            streetLines: [
              input.recipient.address1,
              ...(input.recipient.address2 ? [input.recipient.address2] : []),
            ],
            city: input.recipient.city,
            stateOrProvinceCode: input.recipient.state,
            postalCode: input.recipient.zip,
            countryCode: input.recipient.countryCode || 'US',
            residential: input.recipient.residential ?? true,
          },
        },
      ],
      shipDatestamp: shipDate,
      serviceType: input.serviceType,
      packagingType: input.packagingType,
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      blockInsightVisibility: false,
      ...(input.oneRate
        ? { shipmentSpecialServices: { specialServiceTypes: ['FEDEX_ONE_RATE'] } }
        : {}),
      shippingChargesPayment: {
        paymentType: 'SENDER',
        payor: {
          responsibleParty: { accountNumber: { value: credentials.accountNumber } },
        },
      },
      labelSpecification: {
        imageType: input.labelFormat || 'PDF',
        labelStockType:
          input.labelFormat === 'ZPLII' || input.labelFormat === 'PNG'
            ? 'STOCK_4X6'
            : 'PAPER_4X6',
        labelFormatType: 'COMMON2D',
        labelPrintingOrientation: 'TOP_EDGE_OF_TEXT_FIRST',
        labelRotation: 'NONE',
      },
      requestedPackageLineItems: input.packages.map((pkg, i) => ({
        sequenceNumber: i + 1,
        weight: { units: 'LB', value: pkg.weightLbs },
        ...(pkg.length && pkg.width && pkg.height
          ? {
              dimensions: {
                length: Math.round(pkg.length),
                width: Math.round(pkg.width),
                height: Math.round(pkg.height),
                units: 'IN',
              },
            }
          : {}),
      })),
      accountNumber: { value: credentials.accountNumber },
    },
  }
}

export function buildRatePayload(credentials: FedExCredentials, input: RateQuoteInput) {
  const shipDate = getTodayInTimezone()

  return {
    accountNumber: { value: credentials.accountNumber },
    rateRequestControlParameters: { returnTransitTimes: true },
    requestedShipment: {
      rateRequestType: ['ACCOUNT'],
      shipper: {
        address: {
          streetLines: [input.shipper.address1],
          city: input.shipper.city,
          stateOrProvinceCode: input.shipper.state,
          postalCode: input.shipper.zip,
          countryCode: input.shipper.countryCode || 'US',
        },
      },
      recipient: {
        address: {
          streetLines: [input.recipient.address1],
          city: input.recipient.city,
          stateOrProvinceCode: input.recipient.state,
          postalCode: input.recipient.zip,
          countryCode: input.recipient.countryCode || 'US',
          residential: input.recipient.residential ?? true,
        },
      },
      serviceType: input.serviceType,
      packagingType: input.packagingType,
      pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
      shipDateStamp: shipDate,
      ...(input.oneRate
        ? { shipmentSpecialServices: { specialServiceTypes: ['FEDEX_ONE_RATE'] } }
        : {}),
      requestedPackageLineItems: input.packages.map((pkg) => ({
        weight: { units: 'LB', value: pkg.weightLbs },
        ...(pkg.length && pkg.width && pkg.height
          ? {
              dimensions: {
                length: Math.round(pkg.length),
                width: Math.round(pkg.width),
                height: Math.round(pkg.height),
                units: 'IN',
              },
            }
          : {}),
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Ship API — create / cancel shipment
// ---------------------------------------------------------------------------

export async function createShipment(
  credentials: FedExCredentials,
  input: CreateShipmentInput
): Promise<CreateShipmentResult> {
  const payload = buildShipmentPayload(credentials, input)
  const result = await fedexRequest<any>(credentials, 'POST', '/ship/v1/shipments', payload)

  const shipment = result.output?.transactionShipments?.[0]
  if (!shipment) throw new Error('No shipment returned from FedEx')

  const piece = shipment.pieceResponses?.[0]
  const trackingNumber = piece?.trackingNumber || shipment.masterTrackingNumber
  const labelData =
    piece?.packageDocuments?.[0]?.encodedLabel || shipment.shipmentDocuments?.[0]?.encodedLabel

  if (!trackingNumber || !labelData) {
    logger.error('FedEx response missing tracking/label', {
      hasTracking: !!trackingNumber,
      hasLabel: !!labelData,
    })
    throw new Error('FedEx response missing tracking number or label data')
  }

  return {
    trackingNumber,
    shipmentId: shipment.masterTrackingNumber || trackingNumber,
    serviceType: input.serviceType,
    labelPdfBase64: labelData,
    labelFormat: input.labelFormat || 'PDF',
  }
}

export async function cancelShipment(
  credentials: FedExCredentials,
  trackingNumber: string
): Promise<{ success: boolean }> {
  await fedexRequest<any>(credentials, 'PUT', '/ship/v1/shipments/cancel', {
    accountNumber: { value: credentials.accountNumber },
    trackingNumber,
  })
  return { success: true }
}

// ---------------------------------------------------------------------------
// Rate API — get rate quote
// ---------------------------------------------------------------------------

export async function getRateQuote(
  credentials: FedExCredentials,
  input: RateQuoteInput
): Promise<RateQuoteResult> {
  const payload = buildRatePayload(credentials, input)
  const result = await fedexRequest<any>(credentials, 'POST', '/rate/v1/rates/quotes', payload)

  const rateDetail = result.output?.rateReplyDetails?.[0]
  if (!rateDetail) throw new Error('No rate quote returned from FedEx')

  const rated = rateDetail.ratedShipmentDetails?.[0]
  const totalCharge = rated?.totalNetCharge ?? rated?.totalNetFedExCharge ?? 0
  const currency = rated?.currency ?? 'USD'

  const surcharges = (rated?.shipmentRateDetail?.surCharges || []).map((s: any) => ({
    type: s.type || s.surchargeType || 'UNKNOWN',
    description: s.description || s.type || '',
    amount: s.amount ?? 0,
  }))

  const transitDays =
    rateDetail.commit?.transitDays?.description ||
    rateDetail.commit?.dateDetail?.dayFormat ||
    null

  return {
    serviceType: rateDetail.serviceType || input.serviceType,
    serviceName: rateDetail.serviceName || input.serviceType,
    totalCharge:
      typeof totalCharge === 'number' ? totalCharge : parseFloat(totalCharge) || 0,
    currency,
    surcharges,
    transitDays,
  }
}

// ---------------------------------------------------------------------------
// Track API — poll live status for a tracking number
// ---------------------------------------------------------------------------

export type FedExTrackResult = {
  trackingNumber: string
  /** FedEx derived status code, e.g. 'DL', 'IT', 'OD', 'OC'. */
  statusCode: string | null
  statusDescription: string | null
  /** ISO timestamp of actual delivery, when FedEx reports one. */
  deliveredAt: string | null
}

export async function trackShipment(
  credentials: FedExCredentials,
  trackingNumber: string
): Promise<FedExTrackResult> {
  const result = await fedexRequest<any>(credentials, 'POST', '/track/v1/trackingnumbers', {
    includeDetailedScans: false,
    trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
  })

  const trackResult = result.output?.completeTrackResults?.[0]?.trackResults?.[0]
  const latest = trackResult?.latestStatusDetail
  const deliveryScan = (trackResult?.dateAndTimes || []).find(
    (d: any) => d.type === 'ACTUAL_DELIVERY'
  )

  return {
    trackingNumber,
    statusCode: latest?.code ?? latest?.derivedCode ?? null,
    statusDescription: latest?.statusByLocale || latest?.description || null,
    deliveredAt: deliveryScan?.dateTime ?? null,
  }
}

/**
 * Build the public FedEx tracking URL for a tracking number.
 */
export function fedexTrackingUrl(trackingNumber: string): string {
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`
}

/**
 * Health check — confirms credentials can acquire an OAuth token.
 */
export async function fedexHealthCheck(): Promise<{
  healthy: boolean
  environment: FedExEnvironment
  message: string
}> {
  const environment = fedexEnvironment()
  const creds = getCredentials()
  if (!creds) {
    return { healthy: false, environment, message: 'FedEx credentials not configured' }
  }
  try {
    await getAccessToken(creds)
    return { healthy: true, environment, message: 'OAuth2 token acquired successfully' }
  } catch (err) {
    return {
      healthy: false,
      environment,
      message: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
