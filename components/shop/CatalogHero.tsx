'use client'

import { Badge } from '@/components/ui/badge'
import { Package, Truck, Shield, HeadphonesIcon } from 'lucide-react'

interface CatalogHeroProps {
  productCount: number
}

const features = [
  {
    icon: Package,
    title: 'Premium Quality',
    description: 'Lab-tested products',
  },
  {
    icon: Truck,
    title: 'Fast Shipping',
    description: '2-3 business days',
  },
  {
    icon: Shield,
    title: 'Secure Orders',
    description: 'Encrypted checkout',
  },
  {
    icon: HeadphonesIcon,
    title: 'Expert Support',
    description: 'Dedicated team',
  },
]

export function CatalogHero({ productCount }: CatalogHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-8 md:p-12">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative">
        <Badge variant="secondary" className="mb-4 bg-white/20 text-white border-0">
          {productCount} Products Available
        </Badge>
        
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
          Premium Pharmaceutical
          <br />
          <span className="text-white/90">Products for Professionals</span>
        </h1>
        
        <p className="text-lg text-white/80 max-w-2xl mb-8">
          Browse our curated selection of high-quality peptides and pharmaceuticals. 
          All products are lab-tested and shipped with proper handling.
        </p>

        {/* Feature badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <feature.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-white text-sm">{feature.title}</p>
                <p className="text-xs text-white/70">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
    </div>
  )
}
