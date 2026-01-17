'use client'

import { Inventory } from '@/lib/sheets'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/DataTable'
import { ColumnDef } from '@tanstack/react-table'

const columns: ColumnDef<Inventory>[] = [
  {
    accessorKey: 'SKU',
    header: 'SKU',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.getValue('SKU')}</span>
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
    accessorKey: 'Cost',
    header: 'Cost',
    cell: ({ row }) => {
      const cost = row.original.Cost
      return `$${cost.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`
    },
  },
  {
    accessorKey: 'SRP',
    header: 'Price',
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
    header: 'Ordered',
    cell: ({ row }) => {
      const ordered = row.getValue('InventoryOrdered') as number
      return ordered.toLocaleString()
    },
  },
  {
    accessorKey: 'InventoryAvailable',
    header: 'Available',
    cell: ({ row }) => {
      const available = row.getValue('InventoryAvailable') as number
      const lowStock = available <= 10
      return (
        <div className="flex items-center gap-2">
          <span className={lowStock ? 'text-red-600 font-semibold' : ''}>
            {available.toLocaleString()}
          </span>
          {lowStock && (
            <Badge variant="destructive" className="text-xs">
              LOW STOCK
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    id: 'opportunityValue',
    header: 'Opportunity Value',
    cell: ({ row }) => {
      const srp = row.original.SRP
      const available = row.original.InventoryAvailable
      const value = srp * available
      return (
        <span className="font-semibold text-green-600">
          ${value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </span>
      )
    },
  },
]

interface InventoryListProps {
  data: Inventory[]
}

export default function InventoryList({ data }: InventoryListProps) {
  // Sort data with low stock items first
  const sortedData = [...data].sort((a, b) => {
    const aLowStock = a.InventoryAvailable <= 10
    const bLowStock = b.InventoryAvailable <= 10
    
    // Low stock items come first
    if (aLowStock && !bLowStock) return -1
    if (!aLowStock && bLowStock) return 1
    
    // Then sort by available inventory (ascending)
    return a.InventoryAvailable - b.InventoryAvailable
  })
  
  return (
    <DataTable
      columns={columns}
      data={sortedData}
      searchKey="MedicationName"
    />
  )
}
