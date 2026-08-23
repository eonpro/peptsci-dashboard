'use client'

import Link from 'next/link'
import { Mail, Clock } from 'lucide-react'
import { SHOP_FOOTER } from '@/lib/shop/portal'

export function ClientFooter() {
  return (
    <footer className="bg-brand-onyx border-t border-white/10 pb-20 md:pb-0">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="font-semibold text-white mb-3">Contact Us</h3>
            <div className="space-y-2 text-sm text-white/60">
              <a
                href={`mailto:${SHOP_FOOTER.email}`}
                className="flex items-center gap-2 hover:text-brand-primary transition-colors"
              >
                <Mail className="h-4 w-4" />
                {SHOP_FOOTER.email}
              </a>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {SHOP_FOOTER.hours}
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Quick Links</h3>
            <div className="space-y-2 text-sm">
              {SHOP_FOOTER.quick.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-white/60 hover:text-brand-primary transition-colors"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Support</h3>
            <div className="space-y-2 text-sm">
              {SHOP_FOOTER.support.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-white/60 hover:text-brand-primary transition-colors"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/50">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} PEPTSCI</span>
            <span className="text-white/20">•</span>
            <span>Client Portal</span>
          </div>
          <div className="flex items-center gap-4">
            {SHOP_FOOTER.legal.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-white transition-colors">
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
