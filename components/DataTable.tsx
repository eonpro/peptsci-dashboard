'use client'

import * as React from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  pageSize?: number
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search...',
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [globalFilter, setGlobalFilter] = React.useState('')

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: pageSize,
      },
    },
  })

  return (
    <div className="w-full space-y-4">
      {searchKey && (
        <div className="flex items-center">
          <input
            placeholder={searchPlaceholder}
            value={globalFilter ?? ''}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0e3a] px-4 py-2.5 text-sm text-gray-900 dark:text-white shadow-xs placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-hidden focus:ring-2 focus:ring-brand-primary/20 dark:focus:ring-brand-primary/40 focus:border-brand-primary dark:focus:border-brand-primary transition-all duration-200 hover:shadow-md"
          />
        </div>
      )}

      {/* overflow-x-auto (not hidden): on phones the table scrolls
          horizontally instead of silently clipping trailing columns. */}
      <div className="rounded-2xl bg-white dark:bg-[#0a0e3a]/50 shadow-xs border border-gray-100 dark:border-white/10 overflow-x-auto hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-brand-primary/5 transition-shadow duration-300">
        <table className="w-full min-w-max">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-gray-100 dark:border-white/10 bg-linear-to-r from-gray-50 to-gray-100/50 dark:from-[#0a0e3a] dark:to-brand-onyx"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            'flex items-center space-x-2',
                            header.column.getCanSort() &&
                              'cursor-pointer select-none hover:text-brand-primary dark:hover:text-brand-primary'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="text-gray-400 dark:text-white/40">
                              {header.column.getIsSorted() === 'desc' ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : header.column.getIsSorted() === 'asc' ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <div className="h-4 w-4" />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-b border-gray-50 dark:border-white/5 hover:bg-blue-50/30 dark:hover:bg-white/5 transition-all duration-200 group"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-6 py-4 text-sm text-gray-900 dark:text-white/80 group-hover:text-gray-900 dark:group-hover:text-white"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground dark:text-white/50"
                >
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground dark:text-white/50">
          Showing{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
          </span>{' '}
          to{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              data.length
            )}
          </span>{' '}
          of <span className="font-medium text-gray-900 dark:text-white">{data.length}</span>{' '}
          results
        </div>

        <div className="flex items-center gap-4">
          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground dark:text-white/50 hidden sm:inline">
              Rows:
            </span>
            <Select
              value={table.getState().pagination.pageSize.toString()}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px] dark:bg-[#0a0e3a] dark:border-white/10 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-brand-onyx dark:border-white/10">
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem
                    key={size}
                    value={size.toString()}
                    className="dark:text-white dark:focus:bg-white/10"
                  >
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 dark:bg-[#0a0e3a] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 dark:bg-[#0a0e3a] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="text-sm text-muted-foreground dark:text-white/50 px-2">
              Page{' '}
              <span className="text-gray-900 dark:text-white">
                {table.getState().pagination.pageIndex + 1}
              </span>{' '}
              of <span className="text-gray-900 dark:text-white">{table.getPageCount()}</span>
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 dark:bg-[#0a0e3a] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 dark:bg-[#0a0e3a] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
