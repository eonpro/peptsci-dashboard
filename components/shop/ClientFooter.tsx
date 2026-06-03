'use client'

import Link from 'next/link'
import { Phone, Mail, Clock } from 'lucide-react'

export function ClientFooter() {
  return (
    <footer className="bg-[#050722] border-t border-white/10">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-3">Contact Us</h3>
            <div className="space-y-2 text-sm text-white/60">
              <a
                href="tel:+18005551234"
                className="flex items-center gap-2 hover:text-[#213cef] transition-colors"
              >
                <Phone className="h-4 w-4" />
                1-800-555-1234
              </a>
              <a
                href="mailto:orders@peptsci.com"
                className="flex items-center gap-2 hover:text-[#213cef] transition-colors"
              >
                <Mail className="h-4 w-4" />
                orders@peptsci.com
              </a>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Mon-Fri 9am-5pm PST
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-3">Quick Links</h3>
            <div className="space-y-2 text-sm">
              <Link
                href="/shop"
                className="block text-white/60 hover:text-[#213cef] transition-colors"
              >
                Browse Products
              </Link>
              <Link
                href="/shop/orders"
                className="block text-white/60 hover:text-[#213cef] transition-colors"
              >
                Track Orders
              </Link>
              <Link
                href="/shop/account"
                className="block text-white/60 hover:text-[#213cef] transition-colors"
              >
                Account Settings
              </Link>
            </div>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-white mb-3">Support</h3>
            <div className="space-y-2 text-sm">
              <Link href="#" className="block text-white/60 hover:text-[#213cef] transition-colors">
                FAQ
              </Link>
              <Link href="#" className="block text-white/60 hover:text-[#213cef] transition-colors">
                Shipping Information
              </Link>
              <Link href="#" className="block text-white/60 hover:text-[#213cef] transition-colors">
                Return Policy
              </Link>
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
            <Link href="#" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
