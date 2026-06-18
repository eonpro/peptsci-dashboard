'use client'

import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { ColumnDef } from '@tanstack/react-table'
import { PriceSheet } from '@/lib/pricing'

const columns: ColumnDef<PriceSheet>[] = [
  {
    accessorKey: 'SKU',
    header: 'SKU',
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.getValue('SKU')}</span>,
  },
  {
    accessorKey: 'Product',
    header: 'Product',
    cell: ({ row }) => <span className="font-medium">{row.getValue('Product')}</span>,
  },
  {
    accessorKey: 'Dose',
    header: 'Dose',
  },
  {
    accessorKey: 'Cost',
    header: 'Cost',
    cell: ({ row }) => {
      const cost = row.getValue('Cost') as number
      return `$${cost.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    },
  },
  {
    accessorKey: 'SRP',
    header: 'Suggested Retail Price',
    cell: ({ row }) => {
      const srp = row.getValue('SRP') as number
      const cost = row.original.Cost
      const margin = cost > 0 ? (((srp - cost) / cost) * 100).toFixed(0) : 0

      return (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-brand-primary">
            $
            {srp.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {row.original.Notes === 'In Stock' && (
            <span className="text-xs text-green-600">({row.original.Notes})</span>
          )}
          <Badge variant="outline" className="text-xs">
            {margin}% margin
          </Badge>
        </div>
      )
    },
  },
  {
    accessorKey: 'Notes',
    header: 'Notes',
    cell: ({ row }) => {
      const notes = row.getValue('Notes') as string | undefined
      return notes ? (
        <span className="text-sm text-muted-foreground">{notes}</span>
      ) : (
        <span className="text-sm text-muted-foreground">-</span>
      )
    },
  },
]

interface PricingTableProps {
  data: PriceSheet[]
}

export default function PricingTable({ data }: PricingTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="search"
      searchPlaceholder="Search products..."
      pageSize={20}
    />
  )
}
