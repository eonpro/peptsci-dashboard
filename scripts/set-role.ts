/**
 * Set a user's role/status in Clerk (and sync to Postgres if available).
 *
 * Use this to bootstrap the first SUPER_ADMIN, or to promote/approve any user
 * from the command line.
 *
 * Usage:
 *   npm run set-role -- <email> [role] [status] [clientId]
 *
 * Examples:
 *   npm run set-role -- admin@peptsci.com SUPER_ADMIN ACTIVE
 *   npm run set-role -- alice@clinic.com CLIENT ACTIVE client-wellness-a
 *
 * Passing a clientId links the user to that Client (enables their custom
 * pricing in the shop). Use a seeded id like "client-wellness-a".
 *
 * Requires CLERK_SECRET_KEY in .env.local.
 */

import { createClerkClient } from '@clerk/backend'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig } from '../lib/db-url'

type Role = 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN'
type Status = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

const VALID_ROLES: Role[] = ['CLIENT', 'ADMIN', 'SUPER_ADMIN']
const VALID_STATUS: Status[] = ['PENDING', 'ACTIVE', 'SUSPENDED']

async function main() {
  const [email, roleArg = 'SUPER_ADMIN', statusArg = 'ACTIVE', clientId] = process.argv.slice(2)

  if (!email) {
    console.error('Usage: npm run set-role -- <email> [role] [status] [clientId]')
    process.exit(1)
  }
  const role = roleArg.toUpperCase() as Role
  const status = statusArg.toUpperCase() as Status

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${roleArg}". Must be one of: ${VALID_ROLES.join(', ')}`)
    process.exit(1)
  }
  if (!VALID_STATUS.includes(status)) {
    console.error(`Invalid status "${statusArg}". Must be one of: ${VALID_STATUS.join(', ')}`)
    process.exit(1)
  }

  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    console.error('CLERK_SECRET_KEY is not set in the environment (.env.local).')
    process.exit(1)
  }

  const clerk = createClerkClient({ secretKey })

  const { data: users } = await clerk.users.getUserList({ emailAddress: [email] })
  const user = users[0]
  if (!user) {
    console.error(`No Clerk user found with email ${email}. Have them sign up first.`)
    process.exit(1)
  }

  await clerk.users.updateUserMetadata(user.id, {
    publicMetadata: {
      ...user.publicMetadata,
      role,
      status,
      ...(clientId ? { clientId } : {}),
    },
  })
  console.log(
    `Clerk: set ${email} -> role=${role}, status=${status}${clientId ? `, clientId=${clientId}` : ''}`
  )

  // Sync to Postgres if reachable.
  const poolConfig = getPoolConfig()
  if (poolConfig) {
    const pool = new pg.Pool(poolConfig)
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
    try {
      await prisma.user.updateMany({
        where: { clerkUserId: user.id },
        data: { role, status, ...(clientId ? { clientId } : {}) },
      })
      console.log('Postgres: synced role/status')
    } catch (e) {
      console.warn('Postgres sync skipped/failed:', e instanceof Error ? e.message : String(e))
    } finally {
      await prisma.$disconnect()
    }
  }

  console.log('\nDone. The user must sign out/in (or refresh their session) for changes to take effect.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
