'use client'

import { Badge } from '@/components/ui/badge'
import { FlaskConical, Truck, Shield, HeadphonesIcon } from 'lucide-react'

interface CatalogHeroProps {
  productCount: number
}

const features = [
  {
    icon: FlaskConical,
    title: '99%+ Purity',
    description: 'Third-party tested',
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
    <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-[#213cef] via-[#1a30c0] to-[#0a0e3a] p-5 md:p-8 lg:p-12 border border-white/10">
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
        <Badge
          variant="secondary"
          className="mb-3 md:mb-4 bg-white/20 text-white border-0 text-xs md:text-sm"
        >
          {productCount} Products Available
        </Badge>

        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3 md:mb-4 leading-tight">
          Premium Research Peptides
          <span className="block text-white/90 text-lg sm:text-xl md:text-2xl lg:text-3xl mt-1">
            For Professional Use Only
          </span>
        </h1>

        <p className="text-sm md:text-base lg:text-lg text-white/80 max-w-2xl mb-5 md:mb-8 leading-relaxed">
          Browse our curated selection of high-purity lyophilized research peptides. All products
          are third-party tested with certificates of analysis available.
        </p>

        {/* Feature badges - 2x2 grid on mobile, 4 columns on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex items-center gap-2 md:gap-3 rounded-xl bg-white/10 backdrop-blur-sm px-3 md:px-4 py-2.5 md:py-3 border border-white/10"
            >
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-white/20 flex-shrink-0">
                <feature.icon className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-xs md:text-sm truncate">
                  {feature.title}
                </p>
                <p className="text-[10px] md:text-xs text-white/70 truncate">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative elements - smaller on mobile */}
      <div className="absolute -top-10 -right-10 md:-top-20 md:-right-20 h-32 w-32 md:h-64 md:w-64 rounded-full bg-[#213cef]/30 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 md:-bottom-20 md:-left-20 h-32 w-32 md:h-64 md:w-64 rounded-full bg-[#213cef]/30 blur-3xl" />
    </div>
  )
}
