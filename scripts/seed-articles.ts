/**
 * Seed starter articles for the client-portal Resources hub (/shop/resources).
 *
 * Idempotent: articles are upserted by slug, so re-running refreshes the
 * authored content without creating duplicates.
 *
 * Run locally:   npm run seed:articles
 * Run vs prod:   ALLOW_REMOTE_SEED=1 npm run seed:articles
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig, assertLocalOrExplicitOverride } from '../lib/db-url'
import { computeReadTimeMinutes } from '../lib/articles'

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PGHOST/PGPASSWORD).')
  process.exit(1)
}

assertLocalOrExplicitOverride('seed-articles')

const pool = new pg.Pool(poolConfig)
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

interface SeedArticle {
  slug: string
  title: string
  excerpt: string
  category: string
  authorName: string
  body: string
}

const ARTICLES: SeedArticle[] = [
  {
    slug: 'understanding-glp-1-receptor-agonists',
    title: 'Understanding GLP-1 receptor agonists: a research overview',
    excerpt:
      'What the published literature says about GLP-1 receptor agonist peptides, their mechanism of action, and the areas researchers are actively studying.',
    category: 'GLP-1',
    authorName: 'PeptSci Research Team',
    body: `## What are GLP-1 receptor agonists?

Glucagon-like peptide-1 (GLP-1) is an incretin hormone secreted by intestinal L-cells in response to nutrient intake. GLP-1 receptor agonists are peptide analogues engineered to activate the GLP-1 receptor with a longer half-life than the native hormone, which is degraded within minutes by the enzyme D