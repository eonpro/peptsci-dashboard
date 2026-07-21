'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { PriceSheet } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type JsPDF from 'jspdf'
import { SupplierPriceImportDialog } from '@/components/admin/SupplierPriceImportDialog'

interface POItem {
  id: string
  product: string
  sku: string
  dose: string
  cost: number
  quantity: number
  total: number
}

interface SupplierPriceItem {
  id: string
  supplierSku: string
  productName: string
  dose: string
  vialsPerBox: number | null
  unitCost: number
  listPrice: number | null
}

interface Supplier {
  id: string
  name: string
  priceItems: SupplierPriceItem[]
}

/** Sentinel for pricing a PO from our own catalog (variant unitCost). */
const CATALOG_SOURCE = 'catalog'

export default function POGeneratorPage() {
  const [catalogProducts, setCatalogProducts] = useState<PriceSheet[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [priceSource, setPriceSource] = useState<string>(CATALOG_SOURCE)
  const [poItems, setPOItems] = useState<POItem[]>([])
  const [loading, setLoading] = useState(true)
  const [poNumber, setPONumber] = useState('')
  const [vendor, setVendor] = useState('')

  // Generate PO number on mount
  useEffect(() => {
    const date = new Date()
    const poNum = `PO-${format(date, 'yyyyMMdd')}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`
    setPONumber(poNum)
  }, [])

  const fetchSuppliers = useCallback(async (): Promise<Supplier[]> => {
    try {
      const response = await fetch('/api/admin/suppliers')
      if (!response.ok) return []
      const data = await response.json()
      const list = (data?.suppliers ?? []) as Supplier[]
      setSuppliers(list)
      return list
    } catch (error) {
      console.error('Error fetching suppliers:', error)
      return []
    }
  }, [])

  // Fetch catalog products + supplier price lists on mount
  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch('/api/prices')
        const data = await response.json()
        // API returns { source, prices } from Postgres or flat array from Sheets
        const rawPrices = Array.isArray(data) ? data : data.prices ?? data
        // Normalise to PriceSheet shape regardless of source
        const normalised = (rawPrices as Record<string, unknown>[]).map((p) => ({
          SKU: (p.sku ?? p.SKU ?? '') as string,
          Product: (p.productName ?? p.Product ?? '') as string,
          Dose: (p.dose ?? p.Dose ?? '') as string,
          Cost: Number(p.unitCost ?? p.Cost ?? 0),
          SRP: Number(p.srp ?? p.SRP ?? 0),
        }))
        setCatalogProducts(normalised as unknown as PriceSheet[])
      } catch (error) {
        console.error('Error fetching products:', error)
        toast.error('Failed to load the product catalog — refresh to retry')
      } finally {
        setLoading(false)
      }
    }
    fetchProducts()
    fetchSuppliers()
  }, [fetchSuppliers])

  const selectedSupplier =
    priceSource === CATALOG_SOURCE ? null : (suppliers.find((s) => s.id === priceSource) ?? null)

  // Product list for the item picker: our catalog, or the selected supplier's
  // price list (their Cat.No + our negotiated per-vial cost).
  const products = useMemo<PriceSheet[]>(() => {
    if (!selectedSupplier) return catalogProducts
    return selectedSupplier.priceItems.map((i) => ({
      SKU: i.supplierSku,
      Product: i.productName,
      Dose: i.dose,
      Cost: i.unitCost,
      SRP: i.listPrice ?? i.unitCost,
    }))
  }, [selectedSupplier, catalogProducts])

  // Switching price source re-prices the sheet, so line items no longer match.
  const changePriceSource = (value: string) => {
    setPriceSource(value)
    setPOItems([])
    const supplier = value === CATALOG_SOURCE ? null : suppliers.find((s) => s.id === value)
    setVendor(supplier ? supplier.name : '')
  }

  // After a price-list import, refresh and select the imported supplier.
  const handleImported = async (supplierName: string) => {
    const list = await fetchSuppliers()
    const imported = list.find((s) => s.name.toLowerCase() === supplierName.toLowerCase())
    if (imported) {
      setPriceSource(imported.id)
      setPOItems([])
      setVendor(imported.name)
    }
    toast.success(`${supplierName} price list ready`)
  }

  const addItem = () => {
    const newItem: POItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      product: '',
      sku: '',
      dose: '',
      cost: 0,
      quantity: 1,
      total: 0,
    }
    setPOItems((prevItems) => [...prevItems, newItem])
  }

  const removeItem = (id: string) => {
    setPOItems((prevItems) => prevItems.filter((item) => item.id !== id))
  }

  const updateItem = <K extends keyof POItem>(id: string, field: K, value: POItem[K]) => {
    setPOItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== id) {
          return item
        }

        const updated: POItem = { ...item, [field]: value }

        if (field === 'product' && typeof value === 'string' && value) {
          const product = products.find((p) => `${p.Product} ${p.Dose}` === value)
          if (product) {
            updated.product = value
            updated.sku = product.SKU
            updated.dose = product.Dose
            updated.cost = product.Cost
            updated.total = product.Cost * updated.quantity
          }
        }

        if (field === 'quantity') {
          const quantity = typeof value === 'number' ? value : Number(value) || 0
          updated.quantity = quantity
          updated.total = updated.cost * quantity
        }

        return updated
      })
    )
  }

  const getTotalCost = () => {
    return poItems.reduce((sum, item) => sum + (item.total || 0), 0)
  }

  const exportPDF = async () => {
    if (poItems.length === 0 || poItems.every((item) => !item.product)) {
      alert('Please add at least one item to the purchase order')
      return
    }

    // Load the (heavy) PDF libraries only when the user actually exports, so
    // they never ship in the initial PO-generator bundle.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])

    const doc = new jsPDF()

    // Set font to Helvetica (closest to Poppins available in jsPDF)
    doc.setFont('helvetica')

    // Add the PEPTSCI logo
    try {
      // Use the Next.js Image API to get the logo
      const response = await fetch(
        '/_next/image?url=https%3A%2F%2Fstatic.wixstatic.com%2Fmedia%2Fc49a9b_dc1a4a002b144f1fbabb0bcc9b1fa5e2~mv2.png&w=256&q=75'
      )
      const blob = await response.blob()
      const reader = new FileReader()

      await new Promise<void>((resolve) => {
        reader.onloadend = () => {
          const base64data = reader.result as string
          try {
            doc.addImage(base64data, 'PNG', 15, 10, 50, 16)
          } catch (imgError) {
            console.error('Error adding image:', imgError)
            // Fallback to text if image fails
            doc.setFontSize(26)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(33, 60, 239)
            doc.text('PEPTSCI', 15, 20)
          }
          resolve()
        }
        reader.onerror = () => {
          // Fallback to text logo
          doc.setFontSize(26)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(33, 60, 239)
          doc.text('PEPTSCI', 15, 20)
          resolve()
        }
        reader.readAsDataURL(blob)
      })
    } catch (error) {
      console.error('Error loading logo:', error)
      // Fallback to text logo
      doc.setFontSize(26)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(33, 60, 239)
      doc.text('PEPTSCI', 15, 20)
    }

    // Style text to look like Poppins
    doc.setFontSize(16)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.text('PURCHASE ORDER', 105, 40, { align: 'center' })

    // Add a line separator
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.line(15, 45, 195, 45)

    // Add PO details with Poppins-like styling
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('PO Number:', 15, 55)
    doc.text('Date:', 15, 62)
    doc.text('Vendor:', 15, 69)

    doc.setFont('helvetica', 'normal')
    doc.text(poNumber, 50, 55)
    doc.text(format(new Date(), 'MMMM dd, yyyy'), 50, 62)
    doc.text(vendor || 'TBD', 50, 69)

    // Filter out empty items
    const validItems = poItems.filter((item) => item.product && item.quantity > 0)

    if (validItems.length === 0) {
      alert('Please add valid items with products and quantities')
      return
    }

    // Prepare table data
    const tableData = validItems.map((item) => [
      item.sku || '-',
      item.product || '-',
      item.quantity.toString(),
      `$${(item.cost || 0).toFixed(2)}`,
      `$${(item.total || 0).toFixed(2)}`,
    ])

    // Add table using autoTable plugin
    try {
      // Apply autoTable to the doc instance
      autoTable(doc, {
        head: [['SKU', 'Product', 'Quantity', 'Unit Cost', 'Total']],
        body: tableData,
        startY: 80,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
          font: 'helvetica',
          cellWidth: 'auto',
          halign: 'left',
        },
        headStyles: {
          fillColor: [33, 60, 239],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10,
          cellPadding: 5,
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: [248, 248, 248],
        },
        columnStyles: {
          2: { halign: 'center' }, // Center quantity column
          3: { halign: 'right' }, // Right align unit cost
          4: { halign: 'right' }, // Right align total
        },
        foot: [['', '', '', 'Total:', `$${getTotalCost().toFixed(2)}`]],
        footStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 10,
        },
      })
    } catch (error) {
      console.error('AutoTable not available, using fallback:', error)
      // Fallback if autoTable is not available - create a simple text-based table
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      let yPos = 80
      doc.setFont('helvetica', 'bold')
      doc.text('SKU | Product | Qty | Unit Cost | Total', 15, yPos)
      doc.setFont('helvetica', 'normal')
      yPos += 10

      validItems.forEach((item) => {
        const line = `${item.sku || '-'} | ${item.product || '-'} | ${item.quantity} | $${(item.cost || 0).toFixed(2)} | $${(item.total || 0).toFixed(2)}`
        doc.text(line, 15, yPos)
        yPos += 7
      })

      yPos += 10
      doc.setFont('helvetica', 'bold')
      doc.text(`Total: $${getTotalCost().toFixed(2)}`, 15, yPos)
      doc.setFont('helvetica', 'normal')
    }

    // Add footer with Poppins-like styling
    type AutoTableDoc = JsPDF & { lastAutoTable?: { finalY: number } }
    const autoTableDoc = doc as AutoTableDoc
    const finalY = autoTableDoc.lastAutoTable?.finalY ?? 200
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text('Please remit payment to: PEPTSCI LLC', 15, finalY + 15)
    doc.setTextColor(100, 100, 100)
    doc.text('Thank you for your business!', 15, finalY + 22)

    // Add page number
    const pageCount = doc.internal.getNumberOfPages()
    doc.setFontSize(8)
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.text(`Page ${i} of ${pageCount}`, 195, 285, { align: 'right' })
    }

    try {
      // Save the PDF
      doc.save(`${poNumber}.pdf`)
    } catch (error) {
      console.error('Error saving PDF:', error)
      toast.error('Error generating PDF. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 w-64 bg-gray-200 rounded mb-6"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">PO Generator</h2>
          <p className="text-muted-foreground mt-2">
            Create purchase orders for inventory replenishment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SupplierPriceImportDialog
            defaultSupplierName={selectedSupplier?.name ?? ''}
            onImported={handleImported}
          />
          <Button
            onClick={exportPDF}
            disabled={poItems.length === 0}
            className="bg-brand-primary hover:bg-brand-primary/90"
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* PO Details */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Order Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">PO Number</label>
              <Input
                value={poNumber}
                onChange={(e) => setPONumber(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input
                value={format(new Date(), 'yyyy-MM-dd')}
                type="date"
                className="mt-1"
                disabled
              />
            </div>
            <div>
              <label className="text-sm font-medium">Price List</label>
              <Select value={priceSource} onValueChange={changePriceSource}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select price list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CATALOG_SOURCE}>Our catalog (unit cost)</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.priceItems.length} items)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Vendor</label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Enter vendor name"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items</CardTitle>
          <Button onClick={addItem} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {poItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No items added yet. Click &quot;Add Item&quot; to start.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-4 text-sm font-medium text-gray-700">
                  <div className="col-span-4">Product</div>
                  <div className="col-span-2">SKU</div>
                  <div className="col-span-2">Quantity</div>
                  <div className="col-span-2">Unit Cost</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-1"></div>
                </div>

                {poItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-4">
                      <Select
                        value={item.product}
                        onValueChange={(value) => updateItem(item.id, 'product', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem
                              key={`${product.SKU}_${product.Product}_${product.Dose}`}
                              value={`${product.Product} ${product.Dose}`}
                            >
                              {product.Product} {product.Dose}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2">
                      <Input value={item.sku} disabled />
                    </div>

                    <div className="col-span-2">
                      <Input
                        type="text"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={item.quantity === 0 ? '' : item.quantity.toString()}
                        placeholder="0"
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '') // Only allow digits
                          const numValue = value === '' ? 0 : parseInt(value)
                          updateItem(item.id, 'quantity', numValue)
                        }}
                        onBlur={(e) => {
                          // If empty or 0, set to 1 on blur
                          if (!e.target.value || e.target.value === '0') {
                            updateItem(item.id, 'quantity', 1)
                          }
                        }}
                      />
                    </div>

                    <div className="col-span-2">
                      <Input value={`$${item.cost.toFixed(2)}`} disabled />
                    </div>

                    <div className="col-span-1">
                      <span className="font-semibold">${(item.total || 0).toFixed(2)}</span>
                    </div>

                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="p-2 hover:bg-red-50 rounded-md transition-all hover:scale-110 group"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4 text-red-500 group-hover:text-red-600" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="pt-4 border-t">
                  <div className="flex justify-end items-center gap-4">
                    <span className="text-lg font-medium">Total:</span>
                    <span className="text-2xl font-bold text-brand-primary">
                      ${getTotalCost().toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
