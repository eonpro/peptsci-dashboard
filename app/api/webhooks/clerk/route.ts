import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// Clerk webhook event types
interface ClerkEmailAddress {
  id: string
  email_address: string
}

interface ClerkUserEventData {
  id: string
  email_addresses?: ClerkEmailAddress[]
  primary_email_address_id?: string
  first_name?: string | null
  last_name?: string | null
}

interface ClerkWebhookEvent {
  type: string
  data: ClerkUserEventData
}

const clerkWebhookSecret = process.env.CLERK_WEBHOOK_SECRET

export async function POST(req: Request) {
  // Check for webhook secret at runtime
  if (!clerkWebhookSecret) {
    logger.error('Missing CLERK_WEBHOOK_SECRET env variable')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Check if database is configured
  if (!prisma) {
    logger.warn('Database not configured - skipping user sync')
    return NextResponse.json({ received: true, warning: 'Database not configured' }, { status: 200 })
  }

  const payload = await req.text()
  const headerPayload = Object.fromEntries(await headers())

  const svixId = headerPayload['svix-id']
  const svixTimestamp = headerPayload['svix-timestamp']
  const svixSignature = headerPayload['svix-signature']

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 })
  }

  let event: ClerkWebhookEvent

  try {
    const wh = new Webhook(clerkWebhookSecret)
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent
  } catch (error) {
    logger.error('Clerk webhook verification failed', {}, error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'user.created' || event.type === 'user.updated') {
      const {
        id,
        email_addresses,
        first_name,
        last_name,
        primary_email_address_id,
      } = event.data

      const primaryEmail = email_addresses?.find((email) => email.id === primary_email_address_id)
        ?.email_address ?? email_addresses?.[0]?.email_address

      await prisma.user.upsert({
        where: { clerkUserId: id },
        update: {
          email: primaryEmail,
          firstName: first_name ?? undefined,
          lastName: last_name ?? undefined,
          status: 'ACTIVE',
        },
        create: {
          clerkUserId: id,
          email: primaryEmail,
          firstName: first_name ?? undefined,
          lastName: last_name ?? undefined,
          status: 'ACTIVE',
        },
      })

      logger.info('User synced from Clerk webhook', { userId: id, eventType: event.type })
    }

    if (event.type === 'user.deleted') {
      const { id } = event.data
      await prisma.user.updateMany({
        where: { clerkUserId: id },
        data: { status: 'SUSPENDED' },
      })
      logger.info('User suspended from Clerk webhook', { userId: id })
    }
  } catch (error) {
    logger.error('Error handling Clerk webhook', { eventType: event.type }, error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
