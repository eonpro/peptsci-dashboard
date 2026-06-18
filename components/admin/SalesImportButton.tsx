'use client'

import { CsvImportDialog } from './CsvImportDialog'
import {
  parseSalesCsv,
  salesImportTemplate,
  SALES_IMPORT_HEADERS,
  type SalesImportRow,
} from '@/lib/sales-import'

/** Admin "Import Sales" button + dialog (writes to SalesRecord via CSV). */
export function SalesImportButton() {
  return (
    <CsvImportDialog<SalesImportRow>
      label="Import Sales"
      title="Bulk Import Sales (CSV)"
      description={
        <>
          Upload historical sales. Rows with an <span className="text-white/80">orderId</span> are
          updated on re-import; others are added. COGS is taken from the file when present, else
          estimated from your catalog cost.
        </>
      }
      headers={SALES_IMPORT_HEADERS}
      templateText={salesImportTemplate()}
      templateFilename="peptsci-sales-import-template.csv"
      endpoint="/api/admin/sales/import"
      parse={parseSalesCsv}
      previewColumns={[
        { header: 'Date', render: (r) => r.date || '-' },
        { header: 'Customer', render: (r) => r.customerName || '-' },
        { header: 'Product', render: (r) => r.product || '-' },
        { header: 'Paid', align: 'right', render: (r) => `$${r.paidAmount.toFixed(2)}` },
        { header: 'Vials', align: 'right', render: (r) => r.vials },
      ]}
    />
  )
}
