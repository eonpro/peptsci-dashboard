/**
 * Resolve the Postgres connection string.
 *
 * Precedence:
 *   1. If PGHOST + PGPASSWORD are present, assemble the URL from the standard
 *      PG* environment variables (this is what the AWS/Vercel RDS integration
 *      injects, and lets the password stay in PGPASSWORD rather than a full URL).
 *   2. Otherwise fall back to an explicitly-set DATABASE_URL.
 *
 * Keep this file dependency-free so it can be imported from both the Next.js
 * runtime (lib/prisma.ts) and the Prisma CLI config (prisma.config.ts).
 */
export function getDatabaseUrl(): string | undefined {
  const host = process.env.PGHOST
  const password = process.env.PGPASSWORD

  if (host && password) {
    const user = encodeURIComponent(process.env.PGUSER || 'postgres')
    const pass = encodeURIComponent(password)
    const port = process.env.PGPORT || '5432'
    const database = process.env.PGDATABASE || 'postgres'
    const sslmode = process.env.PGSSLMODE || 'require'
    return `postgresql://${user}:${pass}@${host}:${port}/${database}?sslmode=${sslmode}`
  }

  return process.env.DATABASE_URL
}

/**
 * True when the resolved database connection points at a local host
 * (localhost / 127.0.0.1 / ::1). Used to guard destructive/seed scripts so they
 * cannot accidentally run against a remote/production database.
 */
export function isLocalDatabase(connectionString?: string): boolean {
  const url = connectionString ?? getDatabaseUrl()
  if (!url) return false
  // PG* -> URL always embeds the host; a bare PGHOST (IAM auth, no URL) is remote.
  if (!getDatabaseUrl() && process.env.PGHOST) return false
  return /@(localhost|127\.0\.0\.1|\[::1\]|::1)(:|\/)/.test(url)
}

/**
 * Abort a seed/maintenance script if it is about to run against a non-local
 * database, unless the operator explicitly opts in with ALLOW_REMOTE_SEED=1.
 * Prevents demo/seed data from leaking into production.
 */
export function assertLocalOrExplicitOverride(scriptName: string): void {
  if (isLocalDatabase()) return
  if (process.env.ALLOW_REMOTE_SEED === '1') {
    console.warn(`[${scriptName}] ALLOW_REMOTE_SEED=1 set — running against a REMOTE database.`)
    return
  }
  console.error(
    `[${scriptName}] Refusing to run: the configured database is not local.\n` +
      `This guard prevents seeding demo data into production. If you really intend\n` +
      `to run against a remote database, re-run with ALLOW_REMOTE_SEED=1.`
  )
  process.exit(1)
}

/**
 * True when we should authenticate to RDS using an IAM auth token instead of a
 * static password: PG host is set, no PGPASSWORD/DATABASE_URL is provided, and
 * an AWS role is available to assume (Vercel OIDC -> AWS).
 */
function shouldUseRdsIamAuth(): boolean {
  return Boolean(
    process.env.PGHOST &&
      process.env.AWS_ROLE_ARN &&
      !process.env.PGPASSWORD &&
      !process.env.DATABASE_URL
  )
}

/**
 * Generate a short-lived RDS IAM auth token, used as the DB password.
 *
 * Credentials come from the Vercel OIDC integration assuming AWS_ROLE_ARN.
 * The heavy AWS/Vercel SDKs are imported lazily so they never load in local
 * dev or the edge runtime.
 *
 * node-postgres calls `password` once per *new* connection, and minting a
 * token does an STS assume-role + RDS signer round trip (hundreds of ms). RDS
 * IAM tokens are valid ~15 min, so we cache the token in module scope and reuse
 * it across connections, refreshing ~1 min ahead of expiry. Concurrent callers
 * share a single in-flight mint (no thundering herd on cold pools).
 */
const RDS_TOKEN_TTL_MS = 14 * 60 * 1000 // refresh ~1 min before the 15-min expiry
let cachedRdsToken: { value: string; expires: number } | null = null
let inflightRdsToken: Promise<string> | null = null

async function mintRdsAuthToken(): Promise<string> {
  const [{ Signer }, { awsCredentialsProvider }] = await Promise.all([
    import('@aws-sdk/rds-signer'),
    import('@vercel/functions/oidc'),
  ])

  const signer = new Signer({
    region: process.env.AWS_REGION as string,
    hostname: process.env.PGHOST as string,
    port: Number(process.env.PGPORT) || 5432,
    username: process.env.PGUSER || 'postgres',
    credentials: awsCredentialsProvider({ roleArn: process.env.AWS_ROLE_ARN as string }),
  })

  return signer.getAuthToken()
}

async function getRdsAuthToken(): Promise<string> {
  const now = Date.now()
  if (cachedRdsToken && cachedRdsToken.expires > now) {
    return cachedRdsToken.value
  }

  // Coalesce concurrent mints so a burst of new connections only signs once.
  if (inflightRdsToken) return inflightRdsToken

  inflightRdsToken = (async () => {
    try {
      const token = await mintRdsAuthToken()
      cachedRdsToken = { value: token, expires: Date.now() + RDS_TOKEN_TTL_MS }
      return token
    } finally {
      inflightRdsToken = null
    }
  })()

  return inflightRdsToken
}

// Minimal shape we return; compatible with node-postgres PoolConfig.
type DbPoolConfig =
  | { connectionString: string; ssl: false | { rejectUnauthorized: boolean } }
  | {
      host: string
      port: number
      user: string
      database: string
      ssl: { rejectUnauthorized: boolean }
      password: () => Promise<string>
      max: number
    }

/**
 * Build node-postgres Pool config.
 *
 * - Local/dev or any setup with a full URL/PGPASSWORD -> connection string,
 *   with SSL controlled explicitly (PGSSLMODE otherwise leaks into local
 *   connections and breaks non-SSL Docker Postgres).
 * - Production RDS with IAM auth -> discrete fields plus an async `password`
 *   function that mints a fresh IAM token per connection.
 */
export function getPoolConfig(): DbPoolConfig | null {
  const connectionString = getDatabaseUrl()
  if (connectionString) {
    const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(connectionString)
    // RDS presents a certificate signed by the Amazon RDS CA. Until the RDS CA
    // bundle is wired in, don't reject unauthorized certs for remote hosts.
    // TODO(hardening): pin the RDS CA bundle and set rejectUnauthorized: true.
    const ssl = isLocal ? (false as const) : { rejectUnauthorized: false }
    return { connectionString, ssl }
  }

  if (shouldUseRdsIamAuth()) {
    return {
      host: process.env.PGHOST as string,
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false },
      password: getRdsAuthToken,
      // RDS connection limits are low; cap pool size for serverless safety.
      max: Number(process.env.PG_POOL_MAX) || 20,
    }
  }

  return null
}
