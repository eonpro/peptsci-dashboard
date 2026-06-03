import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { registerEndCustomer, loginEndCustomer } from '@/lib/end-customer-auth'
import { getStorefrontBySlug } from '@/lib/storefront'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const registerSchema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
})

const loginSchema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'register') {
      const body = await request.json()
      const parsed = registerSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
      }

      const config = await getStorefrontBySlug(parsed.data.slug)
      if (!config || config.status !== 'ACTIVE') {
        return errorResponse('Storefront not found', 404, 'NOT_FOUND')
      }

      const result = await registerEndCustomer({
        storefrontId: config.id,
        email: parsed.data.email,
        password: parsed.data.password,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
      })

      if ('error' in result) return errorResponse(result.error, 409, 'REGISTRATION_FAILED')
      return successResponse({ token: result.token }, 201)
    }

    if (action === 'login') {
      const body = await request.json()
      const parsed = loginSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
      }

      const config = await getStorefrontBySlug(parsed.data.slug)
      if (!config || config.status !== 'ACTIVE') {
        return errorResponse('Storefront not found', 404, 'NOT_FOUND')
      }

      const result = await loginEndCustomer({
        storefrontId: config.id,
        email: parsed.data.email,
        password: parsed.data.password,
      })

      if ('error' in result) return errorResponse(result.error, 401, 'LOGIN_FAILED')
      return successResponse({ token: result.token })
    }

    return errorResponse('action query param must be "register" or "login"', 400, 'INVALID_ACTION')
  } catch (error) {
    logger.error('Storefront auth error', {}, error as Error)
    return errorResponse('Authentication failed')
  }
}
