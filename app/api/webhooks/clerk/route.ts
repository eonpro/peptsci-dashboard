import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Webhook, WebhookEvent } from 'svix'
import { prisma } from '@/lib/prisma'

const clerkWebhookSecret = process.env.CLERK_WEBHOOK_SECRET

if (!clerkWebhookSecret) {
  throw new Error('Missing CLERK_WEBHOOK_SECRET env variable')
}

export async function POST(req: Request) {
  const payload = await req.text()
  const headerPayload = Object.fromEntries(await headers())

  const svixId = headerPayload['svix-id']
  const svixTimestamp = headerPayload['svix-timestamp']
  const svixSignature = headerPayload['svix-signature']

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 400 })
  }

  let event: WebhookEvent

  try {
    const wh = new Webhook(clerkWebhookSecret)
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch (error) {
    console.error('Clerk webhook verification failed', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    if (event.type === 'user.created' || event.type === 'user.updated') {
      const {
        id,
        email_addresses,
        first_name,
        last_name,
      } = event.data

      const primaryEmail = email_addresses?.find((email) => email.id === event.data.primary_email_address_id)
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
    }

    if (event.type === 'user.deleted') {
      const { id } = event.data
      await prisma.user.updateMany({
        where: { clerkUserId: id },
        data: { status: 'SUSPENDED' },
      })
    }
  } catch (error) {
    console.error('Error handling Clerk webhook', error)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
