'use client'

import { DataTable } from '@/components/DataTable'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'

type CustomerMetrics = {
  email: string
  name: string
  phone: string
  city: string
  state: string
  lifetimeSpend: number
  totalOrders: number
  lastOrderDate: Date | null
  avgOrderValue: number
}

const columns: ColumnDef<CustomerMetrics>[] = [
  {
    accessorKey: 'name',
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original
      const id = customer.email || `${customer.phone}_${customer.name}`.replace(/[^a-z0-9_]/gi, '-')
      
      return (
        <Link 
          href={`/customers/${encodeURIComponent(id)}`}
          className="flex items-center space-x-3 hover:text-brand-primary transition-colors"
        >
          <CustomerAvatar name={customer.name} email={customer.email} />
          <div>
            <p className="font-medium">{customer.name}</p>
            <p className="text-sm text-muted-foreground">{customer.city}, {customer.state}</p>
          </div>
        </Link>
      )
    },
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => {
      const email = row.getValue('email') as string
      if (!email) return <span className="text-gray-400">-</span>
      return (
        <a href={`mailto:${email}`} className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors text-sm font-medium">
          {email}
        </a>
      )
    },
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => {
      const phone = row.getValue('phone') as string
      if (!phone) return <span className="text-gray-400">-</span>
      return (
        <a href={`tel:${phone}`} className="text-gray-700 hover:text-indigo-600 transition-colors text-sm font-medium">
          {phone}
        </a>
      )
    },
  },
  {
    accessorKey: 'lifetimeSpend',
    header: 'Lifetime Spend',
    cell: ({ row }) => {
      const amount = row.getValue('lifetimeSpend') as number
      return `$${amount.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`
    },
  },
  {
    accessorKey: 'totalOrders',
    header: 'Total Orders',
  },
  {
    accessorKey: 'avgOrderValue',
    header: 'Avg Order',
    cell: ({ row }) => {
      const amount = row.getValue('avgOrderValue') as number
      return `$${amount.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`
    },
  },
  {
    accessorKey: 'lastOrderDate',
    header: 'Last Order',
    cell: ({ row }) => {
      const date = row.getValue('lastOrderDate') as Date | null
      return date ? format(date, 'MMM dd, yyyy') : '-'
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const customer = row.original
      const id = customer.email || `${customer.phone}_${customer.name}`.replace(/[^a-z0-9_]/gi, '-')
      
      return (
        <Link href={`/customers/${encodeURIComponent(id)}`}>
          <Button variant="ghost" size="sm">
            <Eye className="h-4 w-4" />
          </Button>
        </Link>
      )
    },
  },
]

interface CustomersTableProps {
  data: CustomerMetrics[]
}

export default function CustomersTable({ data }: CustomersTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="search"
      searchPlaceholder="Search by name, email, or phone..."
      pageSize={20}
    />
  )
}
