'use client'

import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { ColumnDef } from '@tanstack/react-table'
import { Inventory } from '@/lib/sheets'

const columns: ColumnDef<Inventory & { inventoryValue: number }>[] = [
  {
    accessorKey: 'SKU',
    header: 'SKU',
    cell: ({ row }) => (
      <span className="font-medium text-sm">{row.getValue('SKU')}</span>
    ),
  },
  {
    accessorKey: 'MedicationName',
    header: 'Product',
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue('MedicationName')}</span>
    ),
  },
  {
    accessorKey: 'Dose',
    header: 'Dose',
  },
  {
    accessorKey: 'SRP',
    header: 'SRP',
    cell: ({ row }) => {
      const srp = row.getValue('SRP') as number
      return `$${srp.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`
    },
  },
  {
    accessorKey: 'InventoryOrdered',
    header: 'Total Ordered',
    cell: ({ row }) => {
      const ordered = row.getValue('InventoryOrdered') as number
      return ordered.toLocaleString()
    },
  },
  {
    accessorKey: 'InventoryAvailable',
    header: 'On Hand',
    cell: ({ row }) => {
      const available = row.getValue('InventoryAvailable') as number
      const LOW_STOCK_THRESHOLD = 10
      
      if (available <= LOW_STOCK_THRESHOLD) {
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium">{available.toLocaleString()}</span>
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-semibold">Low Stock</Badge>
          </div>
        )
      }
      
      return <span>{available.toLocaleString()}</span>
    },
  },
  {
    accessorKey: 'inventoryValue',
    header: 'Opportunity Value',
    cell: ({ row }) => {
      const value = row.getValue('inventoryValue') as number
      return (
        <span className="font-semibold text-brand-primary">
          ${value.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
        </span>
      )
    },
  },
]

interface InventoryTableProps {
  data: (Inventory & { inventoryValue: number })[]
}

export default function InventoryTable({ data }: InventoryTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="search"
      searchPlaceholder="Search medications..."
      pageSize={20}
    />
  )
}
