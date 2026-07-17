/** Remove leftovers from earlier smoke-partners runs (name-stamped rows). */
import { prisma } from '../lib/prisma'

async function main() {
  if (!prisma) throw new Error('No DB connection')
  const orders = await prisma.order.findMany({
    where: { client: { organizationName: { startsWith: 'Smoke ' } } },
    select: { id: true },
  })
  for (const order of orders) {
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } })
    await prisma.salesRecord.deleteMany({ where: { orderId: order.id } })
    await prisma.order.delete({ where: { id: order.id } })
  }
  const orgs = await prisma.partnerOrg.deleteMany({ where: { name: { startsWith: 'Smoke ' } } })
  const clients = await prisma.client.deleteMany({
    where: { organizationName: { startsWith: 'Smoke ' } },
  })
  const users = await prisma.user.deleteMany({ where: { clerkUserId: { startsWith: 'smoke-' } } })
  const variants = await prisma.productVariant.deleteMany({
    where: { product: { name: { startsWith: 'Smoke Peptide' } } },
  })
  const products = await prisma.product.deleteMany({ where: { name: { startsWith: 'Smoke Peptide' } } })
  console.log('cleaned:', {
    orders: orders.length,
    orgs: orgs.count,
    clients: clients.count,
    users: users.count,
    variants: variants.count,
    products: products.count,
  })
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
