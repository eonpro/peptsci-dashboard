import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { clerkClient } from '@clerk/nextjs/server'
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
  public_metadata?: {
    role?: string
    status?: string
    clientId?: string
  }
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
    logger.error(
      'Clerk webhook verification failed',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'user.created') {
      const { id, email_addresses, first_name, last_name, primary_email_address_id } = event.data

      const primaryEmail =
        email_addresses?.find((email) => email.id === primary_email_address_id)?.email_address ??
        email_addresses?.[0]?.email_address

      // Set default metadata for new users - PENDING approval, CLIENT role
      try {
        const client = await clerkClient()
        await client.users.updateUserMetadata(id, {
          publicMetadata: {
            role: 'CLIENT',
            status: 'PENDING',
          },
        })
        logger.info('Set default metadata for new user', {
          userId: id,
          role: 'CLIENT',
          status: 'PENDING',
        })
      } catch (clerkError) {
        logger.error(
          'Failed to set Clerk metadata',
          {},
          clerkError instanceof Error ? clerkError : new Error(String(clerkError))
        )
      }

      // Sync to database if configured
      if (prisma) {
        await prisma.user.upsert({
          where: { clerkUserId: id },
          update: {
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
          },
          create: {
            clerkUserId: id,
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            role: 'CLIENT',
            status: 'PENDING', // New users start as PENDING
          },
        })
        logger.info('User created in database', { userId: id, status: 'PENDING' })
      }
    }

    if (event.type === 'user.updated') {
      const {
        id,
        email_addresses,
        first_name,
        last_name,
        primary_email_address_id,
        public_metadata,
      } = event.data

      const primaryEmail =
        email_addresses?.find((email) => email.id === primary_email_address_id)?.email_address ??
        email_addresses?.[0]?.email_address

      // Sync to database if configured
      if (prisma) {
        await prisma.user.upsert({
          where: { clerkUserId: id },
          update: {
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            // Sync role and status from Clerk metadata if present
            ...(public_metadata?.role && {
              role: public_metadata.role as 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN',
            }),
            ...(public_metadata?.status && {
              status: public_metadata.status as 'PENDING' | 'ACTIVE' | 'SUSPENDED',
            }),
          },
          create: {
            clerkUserId: id,
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            role: (public_metadata?.role as 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN') || 'CLIENT',
            status: (public_metadata?.status as 'PENDING' | 'ACTIVE' | 'SUSPENDED') || 'PENDING',
          },
        })
        logger.info('User updated in database', { userId: id })
      }
    }

    if (event.type === 'user.deleted') {
      const { id } = event.data

      if (prisma) {
        await prisma.user.updateMany({
          where: { clerkUserId: id },
          data: { status: 'SUSPENDED' },
        })
        logger.info('User suspended from Clerk webhook', { userId: id })
      }
    }
  } catch (error) {
    logger.error(
      'Error handling Clerk webhook',
      { eventType: event.type },
      error instanceof Error ? error : new Error(String(error))
    )
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
