import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendWelcomeEmail } from '@/lib/email'

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

const VALID_ROLES = ['CLIENT', 'ADMIN', 'SUPER_ADMIN'] as const
const VALID_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const
type UserRole = (typeof VALID_ROLES)[number]
type UserStatus = (typeof VALID_STATUSES)[number]

function asRole(value: string | undefined): UserRole | undefined {
  return VALID_ROLES.includes(value as UserRole) ? (value as UserRole) : undefined
}

function asStatus(value: string | undefined): UserStatus | undefined {
  return VALID_STATUSES.includes(value as UserStatus) ? (value as UserStatus) : undefined
}

/** Resolve a clientId from Clerk metadata only if the client actually exists locally. */
async function resolveExistingClientId(clientId: string | undefined): Promise<string | undefined> {
  if (!clientId || !prisma) return undefined
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  return client ? client.id : undefined
}

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
      const { id, email_addresses, first_name, last_name, primary_email_address_id, public_metadata } =
        event.data

      const primaryEmail =
        email_addresses?.find((email) => email.id === primary_email_address_id)?.email_address ??
        email_addresses?.[0]?.email_address

      // Invitation sign-ups carry admin-seeded metadata (role/status/clientId) from
      // clerk.invitations.createInvitation — preserve it. Only self-serve sign-ups
      // (no seeded metadata) get the PENDING/CLIENT defaults.
      const seededRole = asRole(public_metadata?.role)
      const seededStatus = asStatus(public_metadata?.status)
      const seededClientId = await resolveExistingClientId(public_metadata?.clientId)
      const isInvited = Boolean(seededRole || seededStatus)

      const role: UserRole = seededRole ?? 'CLIENT'
      const status: UserStatus = seededStatus ?? 'PENDING'

      if (!isInvited) {
        // Set default metadata for new self-serve users - PENDING approval, CLIENT role
        try {
          const client = await clerkClient()
          await client.users.updateUserMetadata(id, {
            publicMetadata: {
              role,
              status,
            },
          })
          logger.info('Set default metadata for new user', {
            userId: id,
            role,
            status,
          })
        } catch (clerkError) {
          logger.error(
            'Failed to set Clerk metadata',
            {},
            clerkError instanceof Error ? clerkError : new Error(String(clerkError))
          )
        }
      } else {
        logger.info('Preserving invitation metadata for new user', {
          userId: id,
          role,
          status,
          clientId: seededClientId ?? null,
        })
      }

      // Sync to database if configured
      if (prisma) {
        await prisma.user.upsert({
          where: { clerkUserId: id },
          update: {
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            ...(isInvited && { role, status }),
            ...(seededClientId && { clientId: seededClientId }),
          },
          create: {
            clerkUserId: id,
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            role,
            status,
            ...(seededClientId && { clientId: seededClientId }),
          },
        })
        logger.info('User created in database', { userId: id, status })
      }

      // Welcome / under-review email. Never throws; safe to await before 200.
      // Invited users are already active — skip the "under review" messaging.
      if (primaryEmail && !isInvited) {
        await sendWelcomeEmail({ to: primaryEmail, firstName: first_name })
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
        const metadataRole = asRole(public_metadata?.role)
        const metadataStatus = asStatus(public_metadata?.status)
        const metadataClientId = await resolveExistingClientId(public_metadata?.clientId)

        await prisma.user.upsert({
          where: { clerkUserId: id },
          update: {
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            // Sync role/status/clientId from Clerk metadata if present
            ...(metadataRole && { role: metadataRole }),
            ...(metadataStatus && { status: metadataStatus }),
            ...(metadataClientId && { clientId: metadataClientId }),
          },
          create: {
            clerkUserId: id,
            email: primaryEmail,
            firstName: first_name ?? undefined,
            lastName: last_name ?? undefined,
            role: metadataRole || 'CLIENT',
            status: metadataStatus || 'PENDING',
            ...(metadataClientId && { clientId: metadataClientId }),
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
