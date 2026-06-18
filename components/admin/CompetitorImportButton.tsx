'use client'

import { CsvImportDialog } from './CsvImportDialog'
import {
  parseCompetitorCsv,
  competitorImportTemplate,
  COMPETITOR_IMPORT_HEADERS,
  type CompetitorImportRow,
} from '@/lib/competitor-import'

/** Admin "Import Competitors" button + dialog (writes to CompetitorPrice). */
export function CompetitorImportButton() {
  return (
    <CsvImportDialog<CompetitorImportRow>
      label="Import Competitors"
      title="Bulk Import Competitor Prices (CSV)"
      description={
        <>
          Required columns: <span className="text-white/80">competitor, product</span>. Rows upsert
          by (competitor, product, dose), so re-importing updates existing entries.
        </>
      }
      headers={COMPETITOR_IMPORT_HEADERS}
      templateText={competitorImportTemplate()}
      templateFilename="peptsci-competitor-import-template.csv"
      endpoint="/api/admin/competitors/import"
      parse={parseCompetitorCsv}
      previewColumns={[
        { header: 'Competitor', render: (r) => r.competitor },
        { header: 'Product', render: (r) => r.product },
        { header: 'Dose', render: (r) => r.dose || '-' },
        { header: 'Their Price', align: 'right', render: (r) => `$${r.theirPrice.toFixed(2)}` },
        { header: 'Our SRP', align: 'right', render: (r) => `$${r.ourSrp.toFixed(2)}` },
      ]}
    />
  )
}
