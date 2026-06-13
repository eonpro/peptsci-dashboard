import { prisma } from './prisma'
import { logger } from './logger'
import * as crypto from 'crypto'

const DEV_FALLBACK_SECRET = 'dev-ec-secret-change-me'
const TOKEN_EXPIRY_HOURS = 72

/**
 * Resolve the HMAC secret at call time (not import time, so production builds
 * that lack the env var don't crash). In production a missing or default secret
 * is fatal — token forgery on the public storefront would otherwise be trivial.
 */
function getJwtSecret(): string {
  const secret = process.env.END_CUSTOMER_JWT_SECRET
  if (!secret || secret === DEV_FALLBACK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'END_CUSTOMER_JWT_SECRET must be set to a strong non-default value in production'
      )
    }
    return DEV_FALLBACK_SECRET
  }
  return secret
}

interface EndCustomerPayload {
  endCustomerId: string
  storefrontId: string
  email: string
  exp: number
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: EndCustomerPayload): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verifyEndCustomerToken(token: string): EndCustomerPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, signature] = parts
    const expected = crypto
      .createHmac('sha256', getJwtSecret())
      .update(`${header}.${body}`)
      .digest('base64url')

    if (signature !== expected) return null

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as EndCustomerPayload
    if (payload.exp < Date.now()) return null

    return payload
  } catch {
    return null
  }
}

export function createEndCustomerToken(endCustomerId: string, storefrontId: string, email: string): string {
  return sign({
    endCustomerId,
    storefrontId,
    email,
    exp: Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  })
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err)
      resolve(`${salt}:${derived.toString('hex')}`)
    })
  })
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(':')
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err)
      resolve(key === derived.toString('hex'))
    })
  })
}

export async function registerEndCustomer(data: {
  storefrontId: string
  email: string
  password: string
  firstName?: string
  lastName?: string
  phone?: string
}): Promise<{ token: string; endCustomerId: string } | { error: string }> {
  if (!prisma) return { error: 'Database not connected' }

  try {
    const existing = await prisma.endCustomer.findUnique({
      where: { storefrontId_email: { storefrontId: data.storefrontId, email: data.email } },
    })

    if (existing && !existing.isGuest && existing.passwordHash) {
      return { error: 'An account with this email already exists' }
    }

    const passwordHash = await hashPassword(data.password)

    const customer = existing
      ? await prisma.endCustomer.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            isGuest: false,
            firstName: data.firstName ?? existing.firstName,
            lastName: data.lastName ?? existing.lastName,
            phone: data.phone ?? existing.phone,
          },
        })
      : await prisma.endCustomer.create({
          data: {
            storefrontId: data.storefrontId,
            email: data.email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            isGuest: false,
          },
        })

    const token = createEndCustomerToken(customer.id, data.storefrontId, data.email)
    return { token, endCustomerId: customer.id }
  } catch (error) {
    logger.error('End customer registration failed', { email: data.email }, error as Error)
    return { error: 'Registration failed' }
  }
}

export async function loginEndCustomer(data: {
  storefrontId: string
  email: string
  password: string
}): Promise<{ token: string; endCustomerId: string } | { error: string }> {
  if (!prisma) return { error: 'Database not connected' }

  try {
    const customer = await prisma.endCustomer.findUnique({
      where: { storefrontId_email: { storefrontId: data.storefrontId, email: data.email } },
    })

    if (!customer || !customer.passwordHash) {
      return { error: 'Invalid email or password' }
    }

    const valid = await verifyPassword(data.password, customer.passwordHash)
    if (!valid) return { error: 'Invalid email or password' }

    const token = createEndCustomerToken(customer.id, data.storefrontId, data.email)
    return { token, endCustomerId: customer.id }
  } catch (error) {
    logger.error('End customer login failed', { email: data.email }, error as Error)
    return { error: 'Login failed' }
  }
}
