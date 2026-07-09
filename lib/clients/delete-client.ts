/**
 * Force-delete a Client (practice) and the dependents that would otherwise
 * block the FK delete. Cascading relations (ClientPricing, PaymentMethod,
 * Patient, Storefront + children) are left to the DB after explicit cleanup
 * of non-cascading rows.
 *
 * Auth users are unlinked (clientId = null), never deleted.
 *
 * Prefer the non-force path in the admin API when the client has order /
 * invoice history — call this only after an explicit force confirmation.
 */

import type { PrismaClient } from '@prisma/client'

type Db = PrismaClient

export type ClientDeleteCounts = {
  orderItems: number
  orderDocuments: number
  returnItems: number
  returnRequests: number
  inventoryReservations: number
  orders: number
  invoices: number
  documents: number
  clientPricing: number
  usersUnlinked: number
  salesRecordsUnlinked: number
  retailOrdersUnlinked: number
}

export async function deleteClientForce(db: Db, clientId: string): Promise<ClientDeleteCounts> {
  return db.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: { clientId },
      select: { id: true },
    })
    const orderIds = orders.map((o) => o.id)

    let orderItems = 0
    let orderDocuments = 0
    let returnItems = 0
    let returnRequests = 0
    let inventoryReservations = 0
    let salesRecordsUnlinked = 0
    let retailOrdersUnlinked = 0
    let ordersDeleted = 0

    if (orderIds.length > 0) {
      // ReturnItem → ReturnRequest → Order (neither cascades from Order).
      const returns = await tx.returnRequest.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      })
      const returnIds = returns.map((r) => r.id)
      if (returnIds.length > 0) {
        returnItems = (
          await tx.returnItem.deleteMany({ where: { returnRequestId: { in: returnIds } } })
        ).count
        returnRequests = (
          await tx.returnRequest.deleteMany({ where: { id: { in: returnIds } } })
        ).count
      }

      // Non-cascading order children.
      orderItems = (await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })).count
      orderDocuments = (
        await tx.orderDocument.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count
      // Cascades on Order delete, but remove explicitly for clarity on partial schemas.
      inventoryReservations = (
        await tx.inventoryReservation.deleteMany({ where: { orderId: { in: orderIds } } })
      ).count
      await tx.orderFulfillment.deleteMany({ where: { orderId: { in: orderIds } } })

      // Optional FKs that would block Order delete if Restrict, or leave orphans.
      salesRecordsUnlinked = (
        await tx.salesRecord.updateMany({
          where: { orderId: { in: orderIds } },
          data: { orderId: null },
        })
      ).count
      retailOrdersUnlinked = (
        await tx.retailOrder.updateMany({
          where: { peptsciOrderId: { in: orderIds } },
          data: { peptsciOrderId: null },
        })
      ).count
      await tx.invoiceLineItem.updateMany({
        where: { orderId: { in: orderIds } },
        data: { orderId: null },
      })
      await tx.inventoryAdjustment.updateMany({
        where: { orderId: { in: orderIds } },
        data: { orderId: null },
      })
      await tx.shipmentLabel.updateMany({
        where: { orderId: { in: orderIds } },
        data: { orderId: null },
      })
      await tx.packagePhoto.updateMany({
        where: { orderId: { in: orderIds } },
        data: { orderId: null },
      })
      await tx.auditLog.updateMany({
        where: { orderId: { in: orderIds } },
        data: { orderId: null },
      })

      ordersDeleted = (await tx.order.deleteMany({ where: { id: { in: orderIds } } })).count
    }

    // Client-level non-cascading required FKs.
    const invoices = (await tx.invoice.deleteMany({ where: { clientId } })).count
    const documents = (await tx.clientDocument.deleteMany({ where: { clientId } })).count
    const clientPricing = (await tx.clientPricing.deleteMany({ where: { clientId } })).count

    // Optional client FKs — unlink rather than delete.
    const usersUnlinked = (
      await tx.user.updateMany({ where: { clientId }, data: { clientId: null } })
    ).count
    await tx.shipmentLabel.updateMany({ where: { clientId }, data: { clientId: null } })
    await tx.packagePhoto.updateMany({ where: { clientId }, data: { clientId: null } })
    await tx.notification.updateMany({ where: { clientId }, data: { clientId: null } })
    await tx.returnRequest.updateMany({ where: { clientId }, data: { clientId: null } })

    await tx.client.delete({ where: { id: clientId } })

    return {
      orderItems,
      orderDocuments,
      returnItems,
      returnRequests,
      inventoryReservations,
      orders: ordersDeleted,
      invoices,
      documents,
      clientPricing,
      usersUnlinked,
      salesRecordsUnlinked,
      retailOrdersUnlinked,
    }
  })
}
