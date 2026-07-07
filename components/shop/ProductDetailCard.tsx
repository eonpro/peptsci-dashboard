'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// Types for detailed product information
export interface CompoundInfo {
  name: string
  amount: string // e.g., "5mg"
  casNumber?: string
  molecularFormula?: string
  molecularWeight?: string
  purity?: string
}

export interface ProductDetailData {
  id: string
  name: string
  productType?: 'Blend' | 'Single' | 'Stack' | 'Custom'
  compounds: CompoundInfo[]
  totalAmount?: string // e.g., "Total 10mg (Blend)"
  imageUrl?: string
  category?: string
  isPRUO?: boolean // Physician Research Use Only
  disclaimer?: string
}

interface ProductDetailCardProps {
  product: ProductDetailData
  className?: string
}

// Format molecular formula with subscripts
function formatMolecularFormula(formula: string): React.ReactNode {
  if (!formula) return null

  // Split on numbers and keep the delimiters
  const parts = formula.split(/(\d+)/)

  return parts.map((part, index) => {
    // If it's a number, render as subscript
    if (/^\d+$/.test(part)) {
      return (
        <sub key={index} className="text-[0.65em]">
          {part}
        </sub>
      )
    }
    return <span key={index}>{part}</span>
  })
}

// PeptSci logo URL (light version for dark backgrounds)
const PEPTSCI_LOGO_URL =
  'https://static.wixstatic.com/media/c49a9b_a7d9e44fe804486b95fd734d0e3bea8e~mv2.png'

// Fixed card height to ensure consistent sizing regardless of peptide count
const CARD_MIN_HEIGHT = '480px'

export function ProductDetailCard({ product, className }: ProductDetailCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-onyx via-[#0a0e3a] to-brand-onyx border border-white/10',
        className
      )}
      style={{ minHeight: CARD_MIN_HEIGHT }}
    >
      {/* Main content */}
      <div className="p-6 md:p-8 h-full flex flex-col">
        {/* Header with logo and product type */}
        <div className="flex items-start justify-between mb-8">
          {/* PeptSci Logo */}
          <Image
            src={PEPTSCI_LOGO_URL}
            alt="PeptSci Research"
            width={140}
            height={45}
            className="h-10 w-auto"
            priority
          />

          {/* Product type badge - not italic */}
          {product.productType && (
            <Badge
              variant="outline"
              className="text-brand-primary border-brand-primary/50 bg-brand-primary/10 font-semibold text-sm px-3 py-1"
            >
              {product.productType}
            </Badge>
          )}
        </div>

        {/* Compounds list - grow to fill space */}
        <div className="space-y-6 grow">
          {product.compounds.map((compound, index) => (
            <div key={index} className="space-y-2">
              {/* Compound name and amount - WHITE font */}
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                {compound.name} {compound.amount}
              </h2>

              {/* Scientific details - each on its own line */}
              <div className="text-white/80 text-sm md:text-base space-y-1">
                {/* CAS Number */}
                {compound.casNumber && (
                  <p>
                    <span className="text-white/60">CAS #: </span>
                    {compound.casNumber}
                  </p>
                )}

                {/* Molecular Formula - on its own line */}
                {compound.molecularFormula && (
                  <p>{formatMolecularFormula(compound.molecularFormula)}</p>
                )}

                {/* Molecular Weight */}
                {compound.molecularWeight && (
                  <p>
                    <span className="text-white/60">MW: </span>
                    {compound.molecularWeight}
                  </p>
                )}

                {/* Purity - on its own line */}
                {compound.purity && (
                  <p>
                    <span className="text-white/60">Purity: </span>
                    {compound.purity}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom section - always at bottom */}
        <div className="mt-auto pt-6">
          {/* Total amount */}
          {product.totalAmount && (
            <p className="text-2xl md:text-3xl font-bold text-brand-primary mb-4">{product.totalAmount}</p>
          )}

          {/* PRUO badge and disclaimer */}
          <div className="space-y-2">
            {product.isPRUO && (
              <div className="flex items-center gap-2">
                <Badge className="bg-transparent border-2 border-brand-primary text-brand-primary font-bold text-xs px-2 py-0.5 rounded">
                  PRUO
                </Badge>
                <span className="text-white/80 text-sm">Physician Research Use Only</span>
              </div>
            )}
            {product.disclaimer && <p className="text-white/50 text-xs">{product.disclaimer}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Example usage with mock data
export const EXAMPLE_BLEND_PRODUCT: ProductDetailData = {
  id: 'bpc-tb-blend-10mg',
  name: 'BPC-157 / TB-500 Blend',
  productType: 'Blend',
  compounds: [
    {
      name: 'BPC-157',
      amount: '5mg',
      casNumber: '137525-51-0',
      molecularFormula: 'C62H98N16O22',
      molecularWeight: '1419.556g/mol',
      purity: '99%',
    },
    {
      name: 'TB-500',
      amount: '5mg',
      casNumber: '77591-33-4',
      molecularFormula: 'C212H350N56O78S',
      molecularWeight: '4963.44g/mol',
      purity: '99%',
    },
  ],
  totalAmount: 'Total 10mg (Blend)',
  imageUrl: 'https://static.wixstatic.com/media/c49a9b_1fd3d9441a0e48aab8d6966be16eda0b~mv2.webp',
  isPRUO: true,
  disclaimer: 'Not for human or veterinary use.',
}
