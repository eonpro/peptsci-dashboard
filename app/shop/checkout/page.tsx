'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/components/shop/CartContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { AddressFields } from '@/components/AddressFields'
import {
  ArrowLeft,
  CreditCard,
  Package,
  Truck,
  ChevronRight,
  CheckCircle2,
  Building2,
  UserRound,
  Plus,
  Zap,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { CheckoutPaymentSection } from '@/components/shop/CheckoutPaymentSection'
import {
  computeShipping,
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_RATES,
  type ShipSpeed,
  type ShipTo,
} from '@/lib/checkout-core'
import type { Address } from '@/lib/address'

type CheckoutStep = 'shipping' | 'payment'

interface Patient {
  id: string
  firstName: string
  lastName: string
  address: Address
  phone: string | null
  email: string | null
}

const emptyAddress: Partial<Address> = { country: 'US' }

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clearCart, totalItems } = useCart()
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('shipping')

  const [shipTo, setShipTo] = useState<ShipTo>('PRACTICE')
  const [shipSpeed, setShipSpeed] = useState<ShipSpeed>('TWO_DAY')

  // Practice ship-to (prefilled from the practice profile).
  const [practiceName, setPracticeName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [practiceAddr, setPracticeAddr] = useState<Partial<Address>>(emptyAddress)

  // Patient ship-to.
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string>('')
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [savingPatient, setSavingPatient] = useState(false)
  const [addPatientError, setAddPatientError] = useState<string | null>(null)
  const [newPatient, setNewPatient] = useState<{
    firstName: string
    lastName: string
    phone: string
    address: Partial<Address>
  }>({ firstName: '', lastName: '', phone: '', address: emptyAddress })

  const [notes, setNotes] = useState('')
  const [prefillFailed, setPrefillFailed] = useState(false)
  // Field errors shown after the user tries to continue with invalid input.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  // Prefill the practice address from the profile.
  useEffect(() => {
    let active = true
    fetch('/api/shop/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return
        if (!data?.profile) {
          setPrefillFailed(true)
          return
        }
        const p = data.profile
        setPracticeName(p.organizationName ?? '')
        setContactEmail(p.contactEmail ?? '')
        setContactPhone(p.contactPhone ?? '')
        const addr = p.shippingAddress ?? p.billingAddress
        if (addr) setPracticeAddr(addr)
      })
      .catch(() => {
        if (active) setPrefillFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  // Load saved patients.
  const loadPatients = () => {
    fetch('/api/shop/patients')
      .then((r) => (r.ok ? r.json() : { patients: [] }))
      .then((data) => setPatients(data.patients ?? []))
      .catch(() => {})
  }
  useEffect(() => {
    loadPatients()
  }, [])

  const shipping = computeShipping(subtotal, shipSpeed)
  const total = subtotal + shipping // No tax (Model A)

  const selectedPatient = patients.find((p) => p.id === selectedPatientId)

  // Mirror the server addressSchema: address1/city/state required, ZIP must be
  // 5 digits (optionally +4). Email/phone validated for deliverability.
  const validatePracticeStep = (): Record<string, string> => {
    const errors: Record<string, string> = {}
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      errors.email = 'Enter a valid email address'
    }
    if (contactPhone.trim() && contactPhone.replace(/\D/g, '').length < 10) {
      errors.phone = 'Enter a 10-digit phone number'
    }
    if (!practiceAddr.address1?.trim()) errors.address = 'Street address is required'
    if (!practiceAddr.city?.trim()) errors.address = 'City is required'
    if ((practiceAddr.state?.trim().length ?? 0) < 2) errors.address = 'State is required'
    if (!/^\d{5}(-\d{4})?$/.test(practiceAddr.zip?.trim() ?? '')) {
      errors.zip = 'Enter a valid 5-digit ZIP code'
    }
    return errors
  }

  const shippingValid =
    shipTo === 'PRACTICE'
      ? Boolean(practiceAddr.address1 && practiceAddr.city && practiceAddr.state && practiceAddr.zip)
      : Boolean(selectedPatientId)

  /** Validate then move to payment; on failure surface field errors inline. */
  const continueToPayment = () => {
    if (shipTo === 'PRACTICE') {
      const errors = validatePracticeStep()
      setFieldErrors(errors)
      if (Object.keys(errors).length > 0) return
    }
    setFieldErrors({})
    setCurrentStep('payment')
  }

  const paymentItems = useMemo(
    () => items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
    [items]
  )

  const shippingAddressForOrder = useMemo(() => {
    if (shipTo === 'PATIENT' && selectedPatient) {
      return {
        firstName: selectedPatient.firstName,
        lastName: selectedPatient.lastName,
        phone: selectedPatient.phone ?? undefined,
        ...selectedPatient.address,
      }
    }
    return {
      company: practiceName,
      email: contactEmail,
      phone: contactPhone,
      ...practiceAddr,
    }
  }, [shipTo, selectedPatient, practiceName, contactEmail, contactPhone, practiceAddr])

  const handleOrderSuccess = (orderId: string, opts?: { pending?: boolean }) => {
    clearCart()
    router.push(
      `/shop/checkout/success?order=${encodeURIComponent(orderId)}${opts?.pending ? '&pending=1' : ''}`
    )
  }

  // Mirror the server addressSchema: address1, city, and state required, ZIP
  // must be 5 digits (optionally +4).
  const newPatientAddressValid = Boolean(
    newPatient.address.address1?.trim() &&
      newPatient.address.city?.trim() &&
      (newPatient.address.state?.trim().length ?? 0) >= 2 &&
      /^\d{5}(-\d{4})?$/.test(newPatient.address.zip?.trim() ?? '')
  )
  const canSaveNewPatient = Boolean(
    newPatient.firstName.trim() && newPatient.lastName.trim() && newPatientAddressValid
  )

  const handleAddPatient = async () => {
    setSavingPatient(true)
    setAddPatientError(null)
    try {
      const res = await fetch('/api/shop/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newPatient.firstName,
          lastName: newPatient.lastName,
          phone: newPatient.phone || undefined,
          address: newPatient.address,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.patient) {
        setPatients((prev) => [...prev, data.patient])
        setSelectedPatientId(data.patient.id)
        setShowAddPatient(false)
        setNewPatient({ firstName: '', lastName: '', phone: '', address: emptyAddress })
      } else {
        setAddPatientError(data.message || data.error || 'Could not save the patient. Please try again.')
      }
    } catch {
      setAddPatientError('Could not save the patient. Please check your connection and try again.')
    } finally {
      setSavingPatient(false)
    }
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
        <Button asChild className="h-12 px-8 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl">
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

  const speedOptions: { id: ShipSpeed; label: string; desc: string; price: number }[] = [
    {
      id: 'TWO_DAY',
      label: '2-Day Shipping',
      desc: 'Delivered in 2 business days',
      price: computeShipping(subtotal, 'TWO_DAY'),
    },
    {
      id: 'OVERNIGHT',
      label: 'Overnight Shipping',
      desc: 'Next business day',
      price: computeShipping(subtotal, 'OVERNIGHT'),
    },
  ]

  return (
    <div className="pb-32 md:pb-8">
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
                  ? 'bg-brand-primary text-white'
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
            <>
              {/* Ship to */}
              <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-white/10 bg-white/5">
                  <CardTitle className="flex items-center gap-3 text-white">
                    <div className="h-10 w-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-brand-primary" />
                    </div>
                    Ship To
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        { id: 'PRACTICE', label: 'My Practice', icon: Building2 },
                        { id: 'PATIENT', label: 'A Patient', icon: UserRound },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setShipTo(opt.id)}
                        className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
                          shipTo === opt.id
                            ? 'border-brand-primary bg-brand-primary/10'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <opt.icon className="h-5 w-5 text-white/70" />
                        <span className="text-white font-medium text-sm">{opt.label}</span>
                        {shipTo === opt.id && (
                          <CheckCircle2 className="h-5 w-5 text-brand-primary ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>

                  {shipTo === 'PRACTICE' ? (
                    <div className="space-y-4">
                      {prefillFailed && (
                        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
                          We couldn&apos;t load your saved practice details — please fill in the
                          shipping info below.
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-white/70">
                            Contact Email
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            aria-invalid={!!fieldErrors.email}
                            className={`h-12 bg-white/5 text-white rounded-xl ${fieldErrors.email ? 'border-red-500/60' : 'border-white/10'}`}
                          />
                          {fieldErrors.email && (
                            <p className="text-xs text-red-400">{fieldErrors.email}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone" className="text-white/70">
                            Contact Phone
                          </Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            aria-invalid={!!fieldErrors.phone}
                            className={`h-12 bg-white/5 text-white rounded-xl ${fieldErrors.phone ? 'border-red-500/60' : 'border-white/10'}`}
                          />
                          {fieldErrors.phone && (
                            <p className="text-xs text-red-400">{fieldErrors.phone}</p>
                          )}
                        </div>
                      </div>
                      <AddressFields
                        value={practiceAddr}
                        onChange={setPracticeAddr}
                        idPrefix="practice"
                        dark
                      />
                      {(fieldErrors.address || fieldErrors.zip) && (
                        <p className="text-xs text-red-400">
                          {fieldErrors.address || fieldErrors.zip}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {patients.length > 0 && (
                        <div className="space-y-2">
                          {patients.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedPatientId(p.id)}
                              className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                                selectedPatientId === p.id
                                  ? 'border-brand-primary bg-brand-primary/10'
                                  : 'border-white/10 bg-white/5 hover:bg-white/10'
                              }`}
                            >
                              <UserRound className="h-5 w-5 text-white/70 mt-0.5" />
                              <span className="min-w-0">
                                <span className="block text-white text-sm font-medium">
                                  {p.firstName} {p.lastName}
                                </span>
                                <span className="block text-white/50 text-xs">
                                  {p.address.address1}, {p.address.city}, {p.address.state}{' '}
                                  {p.address.zip}
                                </span>
                              </span>
                              {selectedPatientId === p.id && (
                                <CheckCircle2 className="h-5 w-5 text-brand-primary ml-auto" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {!showAddPatient ? (
                        <Button
                          variant="outline"
                          className="w-full border-white/20 text-white hover:bg-white/10 rounded-xl"
                          onClick={() => setShowAddPatient(true)}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Add a patient
                        </Button>
                      ) : (
                        <div className="space-y-4 p-4 rounded-xl border border-white/10 bg-white/5">
                          <div className="grid gap-4 grid-cols-2">
                            <div className="space-y-2">
                              <Label className="text-white/70">First Name *</Label>
                              <Input
                                value={newPatient.firstName}
                                onChange={(e) =>
                                  setNewPatient((p) => ({ ...p, firstName: e.target.value }))
                                }
                                className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-white/70">Last Name *</Label>
                              <Input
                                value={newPatient.lastName}
                                onChange={(e) =>
                                  setNewPatient((p) => ({ ...p, lastName: e.target.value }))
                                }
                                className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-white/70">Phone</Label>
                            <Input
                              type="tel"
                              value={newPatient.phone}
                              onChange={(e) =>
                                setNewPatient((p) => ({ ...p, phone: e.target.value }))
                              }
                              className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
                            />
                          </div>
                          <AddressFields
                            value={newPatient.address}
                            onChange={(addr) => setNewPatient((p) => ({ ...p, address: addr }))}
                            idPrefix="new-patient"
                            dark
                          />
                          {addPatientError && (
                            <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
                              {addPatientError}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl"
                              onClick={handleAddPatient}
                              disabled={savingPatient || !canSaveNewPatient}
                            >
                              {savingPatient ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Save Patient'
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              className="border-white/20 text-white hover:bg-white/10 rounded-xl"
                              onClick={() => {
                                setShowAddPatient(false)
                                setAddPatientError(null)
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Shipping speed */}
              <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-white/10 bg-white/5">
                  <CardTitle className="flex items-center gap-3 text-white">
                    <div className="h-10 w-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-brand-primary" />
                    </div>
                    Shipping Speed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6 space-y-3">
                  {speedOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShipSpeed(opt.id)}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
                        shipSpeed === opt.id
                          ? 'border-brand-primary bg-brand-primary/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{opt.label}</p>
                        <p className="text-white/50 text-xs">{opt.desc}</p>
                      </div>
                      <span
                        className={`text-sm font-semibold ${opt.price === 0 ? 'text-green-400' : 'text-white'}`}
                      >
                        {opt.price === 0 ? 'FREE' : formatPrice(opt.price)}
                      </span>
                      {shipSpeed === opt.id && <CheckCircle2 className="h-5 w-5 text-brand-primary" />}
                    </button>
                  ))}
                  {subtotal < FREE_SHIPPING_THRESHOLD && (
                    <p className="text-xs text-white/50">
                      Spend {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} more to unlock FREE
                      2-day shipping and {formatPrice(SHIPPING_RATES.QUALIFIED.OVERNIGHT)} overnight.
                    </p>
                  )}

                  <div className="space-y-2 pt-2">
                    <Label htmlFor="notes" className="text-white/70">
                      Order Notes (optional)
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Special instructions for your order..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl min-h-[80px]"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {currentStep === 'payment' && (
            <>
              {/* Review before pay: editable summary of where and how this ships. */}
              <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
                <CardContent className="p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <p className="mb-1 flex items-center gap-2 font-medium text-white">
                        <Truck className="h-4 w-4 text-brand-primary" />
                        Shipping to{' '}
                        {shipTo === 'PATIENT' && selectedPatient
                          ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                          : practiceName || 'your practice'}
                      </p>
                      <p className="text-white/60">
                        {shipTo === 'PATIENT' && selectedPatient
                          ? `${selectedPatient.address.address1}, ${selectedPatient.address.city}, ${selectedPatient.address.state} ${selectedPatient.address.zip}`
                          : `${practiceAddr.address1 ?? ''}, ${practiceAddr.city ?? ''}, ${practiceAddr.state ?? ''} ${practiceAddr.zip ?? ''}`}
                      </p>
                      <p className="mt-1 text-white/60">
                        {shipSpeed === 'TWO_DAY' ? '2-Day Shipping' : 'Overnight Shipping'} ·{' '}
                        {shipping === 0 ? 'FREE' : formatPrice(shipping)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-white hover:bg-white/10 rounded-lg"
                      onClick={() => setCurrentStep('shipping')}
                    >
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-white/10 bg-white/5">
                  <CardTitle className="flex items-center gap-3 text-white">
                    <div className="h-10 w-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-brand-primary" />
                    </div>
                    Payment
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  <CheckoutPaymentSection
                    items={paymentItems}
                    shippingAddress={shippingAddressForOrder}
                    notes={notes || undefined}
                    total={total}
                    shipTo={shipTo}
                    shipSpeed={shipSpeed}
                    patientId={shipTo === 'PATIENT' ? selectedPatientId : null}
                    onSuccess={handleOrderSuccess}
                  />
                </CardContent>
              </Card>
            </>
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
                      <div className="h-12 w-12 rounded-lg bg-linear-to-br from-brand-primary/20 to-brand-primary/5 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            width={48}
                            height={48}
                            className="object-contain"
                          />
                        ) : (
                          <span className="text-sm font-bold text-brand-primary">
                            {item.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{item.name}</p>
                        <p className="text-xs text-white/50">
                          {item.dose} × {item.quantity}
                        </p>
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
                    <span className="text-white/60">
                      Shipping ({shipSpeed === 'TWO_DAY' ? '2-Day' : 'Overnight'})
                    </span>
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

                {currentStep === 'shipping' && (
                  <Button
                    className="w-full h-12 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl font-semibold disabled:opacity-50"
                    onClick={continueToPayment}
                    disabled={shipTo === 'PATIENT' ? !selectedPatientId : !shippingValid}
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

      {/* Mobile fixed bottom bar. On the payment step it stays compact (total
          + back link) so it never competes with the Pay button inside the
          payment card. */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 lg:hidden bg-brand-onyx/95 backdrop-blur-xl border-t border-white/10 p-4 safe-area-bottom">
        {currentStep === 'shipping' ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/60">Total</span>
              <span className="text-xl font-bold text-white">{formatPrice(total)}</span>
            </div>
            <Button
              className="w-full h-14 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-2xl text-lg font-semibold disabled:opacity-50"
              onClick={continueToPayment}
              disabled={shipTo === 'PATIENT' ? !selectedPatientId : !shippingValid}
            >
              Continue to Payment
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep('shipping')}
              className="flex items-center gap-1 text-sm text-white/60 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Shipping
            </button>
            <div className="text-right">
              <span className="mr-2 text-sm text-white/60">Total</span>
              <span className="text-xl font-bold text-white">{formatPrice(total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
