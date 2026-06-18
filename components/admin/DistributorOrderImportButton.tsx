'use client'

import { CsvImportDialog } from './CsvImportDialog'
import {
  parseDistributorOrderCsv,
  distributorOrderImportTemplate,
  DISTRIBUTOR_IMPORT_HEADERS,
  type DistributorLineRow,
} from '@/lib/distributor-order-import'

/** Admin "Import Orders" button + dialog (writes to DistributorOrder/Line). */
export function DistributorOrderImportButton() {
  return (
    <CsvImportDialog<DistributorLineRow>
      label="Import Orders"
      title="Bulk Import Distributor Orders (CSV)"
      description={
        <>
          One row per line item, grouped by <span className="text-white/80">orderId</span>.
          Order-level fields (date, vendor, status, shipping, paypalFee) are read from each group.
          Re-importing an orderId replaces its line items.
        </>
      }
      headers={DISTRIBUTOR_IMPORT_HEADERS}
      templateText={distributorOrderImportTemplate()}
      templateFilename="peptsci-distributor-order-import-template.csv"
      endpoint="/api/admin/distributor-orders/import"
      parse={parseDistributorOrderCsv}
      previewColumns={[
        { header: 'Order', render: (r) => r.orderId },
        { header: 'Product', render: (r) => r.product },
        { header: 'Qty', align: 'right', render: (r) => r.quantity },
        { header: 'Unit Cost', align: 'right', render: (r) => `$${r.unitCost.toFixed(2)}` },
        { header: 'Line Total', align: 'right', render: (r) => `$${r.lineTotal.toFixed(2)}` },
      ]}
    />
  )
}
