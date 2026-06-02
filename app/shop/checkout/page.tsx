'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/components/shop/CartContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, CreditCard, Package, Truck, ChevronRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { CheckoutPaymentSection } from '@/components/shop/CheckoutPaymentSection'

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
]

// Must mirror server logic in lib/checkout-core.ts (server is authoritative).
const FREE_SHIPPING_THRESHOLD = 500
const FLAT_SHIPPING_RATE = 25

type CheckoutStep = 'shipping' | 'payment'

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clearCart, totalItems } = useCart()
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('shipping')

  const [shippingInfo, setShippingInfo] = useState({
    firstName: '',
    lastName: '',
    company: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
  })

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE
  const total = subtotal + shipping // No tax (Model A)

  const shippingValid =
    shippingInfo.firstName &&
    shippingInfo.lastName &&
    shippingInfo.email &&
    shippingInfo.phone &&
    shippingInfo.address1 &&
    shippingInfo.city &&
    shippingInfo.state &&
    shippingInfo.zip

  const paymentItems = useMemo(
    () => items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
    [items]
  )

  const handleOrderSuccess = (orderId: string) => {
    clearCart()
    router.push(`/shop/checkout/success?order=${encodeURIComponent(orderId)}`)
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="rounded-full bg-white/5 p-8 mb-6">
          <Package className="h-16 w-16 text-white/20" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Your cart is empty</h1>
        <p className="text-white/60 mb-8 max-w-[280px]">
          Add some products to your cart before checking out.
        </p>
        <Button asChild className="h-12 px-8 bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-xl">
          <Link href="/shop">Browse Products</Link>
        </Button>
      </div>
    )
  }

  const steps = [
    { id: 'shipping', label: 'Shipping', shortLabel: 'Ship', icon: Truck },
    { id: 'payment', label: 'Payment', shortLabel: 'Pay', icon: CreditCard },
  ]
  const currentStepIndex = steps.findIndex((s) => s.id === currentStep)

  return (
    <div className="max-w-6xl mx-auto pb-32 md:pb-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/shop"
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Checkout</h1>
          <p className="text-sm text-white/50">
            {totalItems} items · {formatPrice(subtotal)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-8 px-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            <button
              onClick={() => {
                if (index < currentStepIndex) setCurrentStep(step.id as CheckoutStep)
              }}
              disabled={index > currentStepIndex}
              className={`flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-xl transition-all ${
                currentStep === step.id
                  ? 'bg-[#213cef] text-white'
                  : index < currentStepIndex
                    ? 'bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30'
                    : 'bg-white/5 text-white/40'
              }`}
            >
              {index < currentStepIndex ? (
                <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" />
              ) : (
                <step.icon className="h-4 w-4 md:h-5 md:w-5" />
              )}
              <span className="font-medium text-xs md:text-sm hidden sm:inline">{step.label}</span>
              <span className="font-medium text-xs sm:hidden">{step.shortLabel}</span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  index < currentStepIndex ? 'bg-green-500/50' : 'bg-white/10'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {currentStep === 'shipping' && (
            <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/10 bg-white/5">
                <CardTitle className="flex items-center gap-3 text-white">
                  <div className="h-10 w-10 rounded-xl bg-[#213cef]/20 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-[#213cef]" />
                  </div>
                  Shipping Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 space-y-4">
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-white/70">First Name *</Label>
                    <Input
                      id="firstName"
                      value={shippingInfo.firstName}
                      onChange={(e) => setShippingInfo((p) => ({ ...p, firstName: e.target.value }))}
                      className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-white/70">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={shippingInfo.lastName}
                      onChange={(e) => setShippingInfo((p) => ({ ...p, lastName: e.target.value }))}
                      className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company" className="text-white/70">Company / Organization</Label>
                  <Input
                    id="company"
                    value={shippingInfo.company}
                    onChange={(e) => setShippingInfo((p) => ({ ...p, company: e.target.value }))}
                    className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>

                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white/70">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={shippingInfo.email}
                      onChange={(e) => setShippingInfo((p) => ({ ...p, email: e.target.value }))}
                      className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-white/70">Phone *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={shippingInfo.phone}
                      onChange={(e) => setShippingInfo((p) => ({ ...p, phone: e.target.value }))}
                      className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                      required
                    />
                  </div>
                </div>

                <Separator className="bg-white/10 my-2" />

                <div className="space-y-2">
                  <Label htmlFor="address1" className="text-white/70">Address Line 1 *</Label>
                  <Input
                    id="address1"
                    value={shippingInfo.address1}
                    onChange={(e) => setShippingInfo((p) => ({ ...p, address1: e.target.value }))}
                    className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address2" className="text-white/70">Address Line 2</Label>
                  <Input
                    id="address2"
                    value={shippingInfo.address2}
                    onChange={(e) => setShippingInfo((p) => ({ ...p, address2: e.target.value }))}
                    className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>

                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <Label htmlFor="city" className="text-white/70">City *</Label>
                    <Input
                      id="city"
                      value={shippingInfo.city}
                      onChange={(e) => setShippingInfo((p) => ({ ...p, city: e.target.value }))}
                      className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-white/70">State *</Label>
                    <Select
                      value={shippingInfo.state}
                      onValueChange={(v) => setShippingInfo((p) => ({ ...p, state: v }))}
                    >
                      <SelectTrigger className="h-12 bg-white/5 border-white/10 text-white rounded-xl">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#050722] border-white/10 max-h-[300px]">
                        {US_STATES.map((state) => (
                          <SelectItem
                            key={state}
                            value={state}
                            className="text-white focus:bg-white/10 focus:text-white"
                          >
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip" className="text-white/70">ZIP *</Label>
                    <Input
                      id="zip"
                      value={shippingInfo.zip}
                      onChange={(e) => setShippingInfo((p) => ({ ...p, zip: e.target.value }))}
                      className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-white/70">Order Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Special instructions for your order..."
                    value={shippingInfo.notes}
                    onChange={(e) => setShippingInfo((p) => ({ ...p, notes: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl min-h-[100px]"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === 'payment' && (
            <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/10 bg-white/5">
                <CardTitle className="flex items-center gap-3 text-white">
                  <div className="h-10 w-10 rounded-xl bg-[#213cef]/20 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-[#213cef]" />
                  </div>
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                <CheckoutPaymentSection
                  items={paymentItems}
                  shippingAddress={{
                    firstName: shippingInfo.firstName,
                    lastName: shippingInfo.lastName,
                    company: shippingInfo.company,
                    email: shippingInfo.email,
                    phone: shippingInfo.phone,
                    address1: shippingInfo.address1,
                    address2: shippingInfo.address2,
                    city: shippingInfo.city,
                    state: shippingInfo.state,
                    zip: shippingInfo.zip,
                  }}
                  notes={shippingInfo.notes || undefined}
                  total={total}
                  onSuccess={handleOrderSuccess}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Order Summary Sidebar */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/10 bg-white/5">
                <CardTitle className="text-white">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-[#213cef]/20 to-[#213cef]/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {item.image ? (
                          <Image src={item.image} alt={item.name} width={48} height={48} className="object-contain" />
                        ) : (
                          <span className="text-sm font-bold text-[#213cef]">{item.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{item.name}</p>
                        <p className="text-xs text-white/50">{item.dose} × {item.quantity}</p>
                      </div>
                      <p className="text-sm font-medium text-white">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>

                <Separator className="bg-white/10" />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Subtotal</span>
                    <span className="text-white">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Shipping</span>
                    <span className={shipping === 0 ? 'text-green-400' : 'text-white'}>
                      {shipping === 0 ? 'FREE' : formatPrice(shipping)}
                    </span>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="flex justify-between text-lg font-bold text-white">
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>

                {shipping === 0 ? (
                  <div className="text-center py-2 px-3 rounded-xl bg-green-500/10 text-green-400 text-sm">
                    🎉 You qualify for free shipping!
                  </div>
                ) : (
                  <p className="text-xs text-center text-white/50">
                    Add {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} more for free shipping
                  </p>
                )}

                {currentStep === 'shipping' && (
                  <Button
                    className="w-full h-12 bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-xl font-semibold disabled:opacity-50"
                    onClick={() => setCurrentStep('payment')}
                    disabled={!shippingValid}
                  >
                    Continue to Payment
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
                {currentStep === 'payment' && (
                  <Button
                    variant="outline"
                    className="w-full h-12 border-white/20 text-white hover:bg-white/10 rounded-xl"
                    onClick={() => setCurrentStep('shipping')}
                  >
                    Back to Shipping
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile fixed bottom bar */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 lg:hidden bg-[#050722]/95 backdrop-blur-xl border-t border-white/10 p-4 safe-area-bottom">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/60">Total</span>
          <span className="text-xl font-bold text-white">{formatPrice(total)}</span>
        </div>
        {currentStep === 'shipping' && (
          <Button
            className="w-full h-14 bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-2xl text-lg font-semibold disabled:opacity-50"
            onClick={() => setCurrentStep('payment')}
            disabled={!shippingValid}
          >
            Continue to Payment
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        )}
        {currentStep === 'payment' && (
          <Button
            variant="outline"
            className="w-full h-14 border-white/20 text-white hover:bg-white/10 rounded-2xl text-lg"
            onClick={() => setCurrentStep('shipping')}
          >
            Back to Shipping
          </Button>
        )}
      </div>
    </div>
  )
}
