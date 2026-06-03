import 'dotenv/config'
import { defineConfig } from 'prisma/config'
import { getDatabaseUrl } from './lib/db-url'

// Resolve from PG* vars (RDS/Vercel) or DATABASE_URL, with a placeholder for `generate`
const databaseUrl =
  getDatabaseUrl() || 'postgresql://placeholder:placeholder@localhost:5432/placeholder'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
})
