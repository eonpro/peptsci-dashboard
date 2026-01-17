'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { PriceSheet } from '@/lib/sheets'

interface ExportButtonProps {
  data: PriceSheet[]
}

export default function ExportButton({ data }: ExportButtonProps) {
  const exportToCSV = () => {
    // Convert data to CSV
    const headers = ['Product', 'Dose', 'Cost', 'SRP', 'Margin %', 'Notes']
    const csvContent = [
      headers.join(','),
      ...data.map(item => {
        const margin = item.Cost > 0 
          ? ((item.SRP - item.Cost) / item.Cost * 100).toFixed(0) 
          : 0
        return [
          item.Product,
          item.Dose,
          item.Cost.toFixed(2),
          item.SRP.toFixed(2),
          margin,
          item.Notes || ''
        ].map(cell => `"${cell}"`).join(',')
      })
    ].join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `price_sheet_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Button onClick={exportToCSV} variant="outline">
      <Download className="mr-2 h-4 w-4" />
      Export to CSV
    </Button>
  )
}
