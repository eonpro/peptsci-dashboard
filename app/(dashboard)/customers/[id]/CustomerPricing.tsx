'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DollarSign, Plus, Trash2, Percent, Tag } from 'lucide-react'

interface CustomerPricingProps {
  customerId: string
  customerName: string
}

// Mock products - in production this would come from API
const mockProducts = [
  { id: 'prod-1', name: 'Semaglutide 2.5mg', sku: 'SEM-2.5', srp: 299.0 },
  { id: 'prod-2', name: 'Semaglutide 5mg', sku: 'SEM-5', srp: 399.0 },
  { id: 'prod-3', name: 'Tirzepatide 5mg', sku: 'TIR-5', srp: 449.0 },
  { id: 'prod-4', name: 'Tirzepatide 10mg', sku: 'TIR-10', srp: 549.0 },
  { id: 'prod-5', name: 'BPC-157 10mg', sku: 'BPC-10', srp: 189.0 },
  { id: 'prod-6', name: 'NAD+ 500mg', sku: 'NAD-500', srp: 299.0 },
]

interface CustomPrice {
  id: string
  productId: string
  productName: string
  productSku: string
  standardPrice: number
  customPrice: number
  discountPercent: number
  notes?: string
}

export function CustomerPricing({ customerId, customerName }: CustomerPricingProps) {
  const [customPrices, setCustomPrices] = useState<CustomPrice[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newPricing, setNewPricing] = useState({
    productId: '',
    customPrice: '',
    notes: '',
  })

  const selectedProduct = mockProducts.find((p) => p.id === newPricing.productId)
  const availableProducts = mockProducts.filter(
    (p) => !customPrices.some((cp) => cp.productId === p.id)
  )

  const handleAddPricing = () => {
    if (!selectedProduct || !newPricing.customPrice) return

    const customPrice = parseFloat(newPricing.customPrice)
    const discountPercent = ((selectedProduct.srp - customPrice) / selectedProduct.srp) * 100

    const newItem: CustomPrice = {
      id: `cp-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      productSku: selectedProduct.sku,
      standardPrice: selectedProduct.srp,
      customPrice,
      discountPercent: Math.round(discountPercent * 10) / 10,
      notes: newPricing.notes,
    }

    setCustomPrices([...customPrices, newItem])
    setNewPricing({ productId: '', customPrice: '', notes: '' })
    setIsAddDialogOpen(false)
  }

  const handleRemovePricing = (id: string) => {
    setCustomPrices(customPrices.filter((cp) => cp.id !== id))
  }

  return (
    <Card className="rounded-2xl bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Tag className="h-5 w-5" />
              Custom Pricing
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Set special prices for {customerName}
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#213cef] hover:bg-[#1a30c0] text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Price
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add Custom Pricing</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Set a special price for {customerName}. This will override the standard retail
                  price when they order.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Product</Label>
                  <Select
                    value={newPricing.productId}
                    onValueChange={(value) => setNewPricing({ ...newPricing, productId: value })}
                  >
                    <SelectTrigger className="bg-background border-input text-foreground">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {availableProducts.length === 0 ? (
                        <SelectItem value="none" disabled className="text-muted-foreground">
                          All products have custom pricing
                        </SelectItem>
                      ) : (
                        availableProducts.map((product) => (
                          <SelectItem
                            key={product.id}
                            value={product.id}
                            className="text-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="flex justify-between items-center w-full">
                              <span>{product.name}</span>
                              <span className="text-muted-foreground ml-2">
                                ${product.srp.toFixed(2)}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedProduct && (
                    <p className="text-sm text-muted-foreground">
                      Standard price: ${selectedProduct.srp.toFixed(2)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Custom Price</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={newPricing.customPrice}
                      onChange={(e) =>
                        setNewPricing({ ...newPricing, customPrice: e.target.value })
                      }
                      className="pl-9 bg-background border-input text-foreground"
                    />
                  </div>
                  {selectedProduct && newPricing.customPrice && (
                    <p className="text-sm text-green-400">
                      <Percent className="inline h-3 w-3 mr-1" />
                      {(
                        ((selectedProduct.srp - parseFloat(newPricing.customPrice)) /
                          selectedProduct.srp) *
                        100
                      ).toFixed(1)}
                      % discount from standard price
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Notes (optional)</Label>
                  <Input
                    placeholder="e.g., Volume discount, Partner pricing..."
                    value={newPricing.notes}
                    onChange={(e) => setNewPricing({ ...newPricing, notes: e.target.value })}
                    className="bg-background border-input text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  className="border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddPricing}
                  disabled={!newPricing.productId || !newPricing.customPrice}
                  className="bg-[#213cef] hover:bg-[#1a30c0] text-white"
                >
                  Add Pricing
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {customPrices.length === 0 ? (
          <div className="text-center py-8">
            <div className="bg-muted/20 p-4 rounded-full w-fit mx-auto mb-4">
              <Tag className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No custom pricing set</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {customerName} will see standard prices
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Product</TableHead>
                <TableHead className="text-muted-foreground">SKU</TableHead>
                <TableHead className="text-muted-foreground text-right">Standard</TableHead>
                <TableHead className="text-muted-foreground text-right">Custom Price</TableHead>
                <TableHead className="text-muted-foreground text-right">Discount</TableHead>
                <TableHead className="text-muted-foreground">Notes</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customPrices.map((item) => (
                <TableRow key={item.id} className="border-border hover:bg-muted/10">
                  <TableCell className="font-medium text-foreground">{item.productName}</TableCell>
                  <TableCell className="text-muted-foreground">{item.productSku}</TableCell>
                  <TableCell className="text-muted-foreground text-right line-through">
                    ${item.standardPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-green-400 text-right font-semibold">
                    ${item.customPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-0">
                      -{item.discountPercent}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                    {item.notes || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleRemovePricing(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
