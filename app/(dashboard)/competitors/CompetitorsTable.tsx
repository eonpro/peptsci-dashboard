'use client'

import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { ColumnDef } from '@tanstack/react-table'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Competitor } from '@/lib/sheets'

const columns: ColumnDef<Competitor>[] = [
  {
    accessorKey: 'Competitor',
    header: 'Competitor',
    cell: ({ row }) => <span className="font-medium">{row.getValue('Competitor')}</span>,
  },
  {
    accessorKey: 'Product',
    header: 'Product',
  },
  {
    accessorKey: 'Dose',
    header: 'Dose',
  },
  {
    accessorKey: 'TheirPrice',
    header: 'Their Price',
    cell: ({ row }) => {
      const price = row.getValue('TheirPrice') as number
      return `$${price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    },
  },
  {
    accessorKey: 'OurSRP',
    header: 'Our SRP',
    cell: ({ row }) => {
      const srp = row.getValue('OurSRP') as number
      return (
        <span className="font-semibold text-brand-primary">
          $
          {srp.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      )
    },
  },
  {
    accessorKey: 'Diff',
    header: 'Difference',
    cell: ({ row }) => {
      const diff = row.getValue('Diff') as number | undefined
      const ourPrice = row.original.OurSRP
      const theirPrice = row.original.TheirPrice
      const actualDiff = diff !== undefined ? diff : ourPrice - theirPrice
      const percentDiff = theirPrice > 0 ? (actualDiff / theirPrice) * 100 : 0

      if (actualDiff < 0) {
        return (
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-green-600" />
            <span className="text-green-600 font-medium">${Math.abs(actualDiff).toFixed(2)}</span>
            <Badge variant="success" className="text-xs">
              {Math.abs(percentDiff).toFixed(0)}% savings
            </Badge>
          </div>
        )
      } else if (actualDiff > 0) {
        return (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-red-600" />
            <span className="text-red-600 font-medium">+${actualDiff.toFixed(2)}</span>
            <Badge variant="destructive" className="text-xs">
              {percentDiff.toFixed(0)}% higher
            </Badge>
          </div>
        )
      } else {
        return (
          <div className="flex items-center gap-2">
            <Minus className="h-4 w-4 text-gray-500" />
            <span className="text-gray-500">Same price</span>
          </div>
        )
      }
    },
  },
]

interface CompetitorsTableProps {
  data: Competitor[]
}

export default function CompetitorsTable({ data }: CompetitorsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="search"
      searchPlaceholder="Search products or competitors..."
      pageSize={20}
    />
  )
}
