/**
 * DB smoke test for the platform-hardening features (Jul 2026):
 *   1. Back-in-stock alerts — subscribe → receive batch → alert fires once
 *   2. Support tickets — create → admin reply → status machine → read flags
 *   3. Audit writer — writeAudit persists a row with metadata
 *
 * Run against LOCAL Postgres only:
 *   DATABASE_URL="postgresql://peptsci:peptsci123@127.0.0.1:5433/peptsci" \
 *     npx tsx scripts/smoke-hardening.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig, assertLocalOrExplicitOverride } from '../lib/db-url'

assertLocalOrExplicitOverride('smoke-hardening')

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured.')
  process.exit(1)
}
const pool = new pg.Pool(poolConfig)
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// The libs under test resolve their own prisma from lib/prisma, which builds
// from the same env DATABASE_URL — import AFTER the guard above.
import { subscribeBackInStock, fireBackInStockAlerts, armedVariantIds } from '../lib/back-in-stock'
import {
  createTicket,
  sendTicketMessage,
  getTicketThreadAndMarkRead,
  setTicketStatus,
  listTicketsForAdmin,
  listTicketsForClient,
} from '../lib/support-tickets'
import { createBatch } from '../lib/inventory-batches'
import { writeAudit } from '../lib/audit'

function assert(cond: unknown, label: string): void {
  if (!cond) {
    console.error(`✖ FAIL: ${label}`)
    process.exitCode = 1
    throw new Error(label)
  }
  console.log(`✔ ${label}`)
}

const TAG = `smoke-hardening-${Date.now()}`

async function main() {
  // ── Fixtures ──
  const product = await prisma.product.create({
    data: { name: `Smoke Peptide ${TAG}`, status: 'ACTIVE', category: 'Peptides' },
  })
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `SMOKE-${Date.now()}`,
      dose: '5mg',
      unitCost: 10,
      srp: 50,
      status: 'ACTIVE',
      inventoryOnHand: 0,
      inventoryReserved: 0,
    },
  })
  const client = await prisma.client.create({
    data: {
      organizationName: `Smoke Clinic ${TAG}`,
      contactEmail: `smoke-${Date.now()}@example.com`,
      contactName: 'Smoke Tester',
      onboardingStatus: 'APPROVED',
    },
  })
  const user = await prisma.user.create({
    data: {
      clerkUserId: `smoke_${Date.now()}`,
      email: `smoke-user-${Date.now()}@example.com`,
      role: 'CLIENT',
      status: 'ACTIVE',
      clientId: client.id,
      firstName: 'Smoke',
      lastName: 'Tester',
    },
  })

  try {
    // ── 1. Back-in-stock ──
    await subscribeBackInStock(client.id, variant.id, user.clerkUserId)
    let armed = await armedVariantIds(client.id)
    assert(armed.has(variant.id), 'back-in-stock: subscription armed')

    // Fire with zero stock → must NOT notify.
    await fireBackInStockAlerts(variant.id)
    let sub = await prisma.backInStockSubscription.findUnique({
      where: { clientId_variantId: { clientId: client.id, variantId: variant.id } },
    })
    assert(sub && sub.notifiedAt === null, 'back-in-stock: zero-stock pass is a no-op')

    // Receive a batch (createBatch fires the alert pass internally).
    const bud = new Date(Date.now() + 180 * 86_400_000)
    await createBatch(
      { variantId: variant.id, qtyReceived: 5, bud },
      { clerkUserId: null, label: 'smoke' }
    )
    // The hook is fire-and-forget; give it a beat.
    await new Promise((r) => setTimeout(r, 1500))

    sub = await prisma.backInStockSubscription.findUnique({
      where: { clientId_variantId: { clientId: client.id, variantId: variant.id } },
    })
    assert(sub?.notifiedAt != null, 'back-in-stock: alert fired after receive')

    const bell = await prisma.notification.findFirst({
      where: { userId: user.id, sourceType: 'back-in-stock' },
    })
    assert(bell != null, 'back-in-stock: clinic user got a bell notification')

    // Re-fire must be a no-op (one-shot).
    const bellCountBefore = await prisma.notification.count({
      where: { userId: user.id, sourceType: 'back-in-stock' },
    })
    await fireBackInStockAlerts(variant.id)
    const bellCountAfter = await prisma.notification.count({
      where: { userId: user.id, sourceType: 'back-in-stock' },
    })
    assert(bellCountBefore === bellCountAfter, 'back-in-stock: alert is one-shot')

    armed = await armedVariantIds(client.id)
    assert(!armed.has(variant.id), 'back-in-stock: fired subscription no longer armed')

    // ── 2. Support tickets ──
    const ticket = await createTicket({
      clientId: client.id,
      subject: `Smoke ticket ${TAG}`,
      body: 'First message from the clinic',
      senderId: user.id,
      senderName: 'Smoke Tester',
      createdBy: user.clerkUserId,
    })
    assert(ticket.status === 'OPEN', 'support: new ticket is OPEN')

    let adminQueue = await listTicketsForAdmin('OPEN')
    const inQueue = adminQueue.find((t) => t.id === ticket.id)
    assert(inQueue != null, 'support: ticket appears in the admin OPEN queue')
    assert(inQueue!.unread === 1, 'support: admin sees 1 unread clinic message')

    // Admin reads the thread → clinic message marked read; replies → PENDING.
    await getTicketThreadAndMarkRead(ticket.id, 'PEPTSCI')
    adminQueue = await listTicketsForAdmin('OPEN')
    assert(
      adminQueue.find((t) => t.id === ticket.id)?.unread === 0,
      'support: admin read cleared the unread count'
    )
    await sendTicketMessage({
      ticketId: ticket.id,
      senderId: null,
      senderName: 'PeptSci Support',
      senderRole: 'PEPTSCI',
      body: 'Reply from staff',
    })
    let fresh = await prisma.supportTicket.findUnique({ where: { id: ticket.id } })
    assert(fresh?.status === 'PENDING', 'support: staff reply parks ticket PENDING')

    const clinicList = await listTicketsForClient(client.id)
    assert(
      clinicList.find((t) => t.id === ticket.id)?.unread === 1,
      'support: clinic sees 1 unread staff message'
    )

    // Clinic reply reopens; resolve closes; clinic reply reopens again.
    await sendTicketMessage({
      ticketId: ticket.id,
      senderId: user.id,
      senderName: 'Smoke Tester',
      senderRole: 'CLINIC',
      body: 'Clinic follow-up',
    })
    fresh = await prisma.supportTicket.findUnique({ where: { id: ticket.id } })
    assert(fresh?.status === 'OPEN', 'support: clinic reply reopens the ticket')

    await setTicketStatus(ticket.id, 'RESOLVED', 'smoke-admin')
    fresh = await prisma.supportTicket.findUnique({ where: { id: ticket.id } })
    assert(
      fresh?.status === 'RESOLVED' && fresh.resolvedAt != null,
      'support: resolve stamps resolvedAt'
    )

    const thread = await getTicketThreadAndMarkRead(ticket.id, 'CLINIC')
    assert(thread.length === 3, 'support: thread has all 3 messages oldest-first')
    assert(thread[0].body === 'First message from the clinic', 'support: thread order correct')

    // ── 3. Audit writer ──
    await writeAudit({
      clerkUserId: null,
      entity: 'SmokeTest',
      entityId: TAG,
      action: 'smoke_audit',
      metadata: { changes: { rate: { from: 1000, to: 1500 } } },
    })
    const auditRow = await prisma.auditLog.findFirst({
      where: { entity: 'SmokeTest', entityId: TAG },
    })
    assert(auditRow != null, 'audit: writeAudit persisted a row')
    assert(
      (auditRow!.metadata as { changes?: { rate?: { to?: number } } })?.changes?.rate?.to === 1500,
      'audit: metadata round-trips'
    )

    console.log('\nAll smoke checks passed.')
  } finally {
    // ── Cleanup (order matters for FKs) ──
    await prisma.auditLog.deleteMany({ where: { entity: 'SmokeTest', entityId: TAG } })
    await prisma.notification.deleteMany({ where: { userId: user.id } })
    await prisma.supportTicket.deleteMany({ where: { clientId: client.id } })
    await prisma.backInStockSubscription.deleteMany({ where: { clientId: client.id } })
    await prisma.inventoryAdjustment.deleteMany({ where: { variantId: variant.id } })
    await prisma.inventoryBatchEvent.deleteMany({ where: { batch: { variantId: variant.id } } })
    await prisma.inventoryBatch.deleteMany({ where: { variantId: variant.id } })
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    await prisma.client.delete({ where: { id: client.id } }).catch(() => {})
    await prisma.productVariant.delete({ where: { id: variant.id } }).catch(() => {})
    await prisma.product.delete({ where: { id: product.id } }).catch(() => {})
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
