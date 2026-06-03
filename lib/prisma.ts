import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig } from './db-url'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient | null
}

function createPrismaClient(): PrismaClient | null {
  const poolConfig = getPoolConfig()
  if (!poolConfig) {
    console.warn('No database connection configured (PGHOST/PGPASSWORD or DATABASE_URL) - Prisma client disabled')
    return null
  }

  const pool = new pg.Pool(poolConfig)

  // On Vercel, register the pool so it is drained when the serverless function
  // suspends; this prevents RDS connection exhaustion across invocations.
  // Imported lazily so the dependency never loads in local dev / the CLI.
  if (process.env.VERCEL) {
    void import('@vercel/functions')
      .then(({ attachDatabasePool }) => attachDatabasePool(pool))
      .catch((err) => console.warn('attachDatabasePool unavailable:', err))
  }

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma
}
