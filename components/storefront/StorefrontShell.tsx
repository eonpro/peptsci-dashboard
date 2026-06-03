'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { ShoppingCart, User, Menu, X, Package } from 'lucide-react'
import { useState } from 'react'
import { StorefrontProvider, useStorefront } from './StorefrontContext'
import { StorefrontCartDrawer } from './StorefrontCartDrawer'
import type { StorefrontPublicConfig } from '@/lib/types/storefront'

function Header() {
  const { config, cartItemCount, toggleCartDrawer, session } = useStorefront()
  const [mobileOpen, setMobileOpen] = useState(false)
  const branding = config?.branding

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        backgroundColor: `${branding?.colors.background ?? '#fff'}ee`,
        borderColor: `${branding?.colors.text ?? '#000'}15`,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Name */}
          <Link href="/" className="flex items-center gap-3">
            {branding?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logo} alt={branding?.name ?? 'Store'} className="h-8 w-auto" />
            ) : (
              <Package className="h-6 w-6" style={{ color: branding?.colors.primary }} />
            )}
            <span
              className="text-lg font-semibold hidden sm:block"
              style={{
                color: branding?.colors.text,
                fontFamily: branding?.fonts?.heading
                  ? `"${branding.fonts.heading}", sans-serif`
                  : undefined,
              }}
            >
              {branding?.name ?? 'Store'}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: branding?.colors.text }}
            >
              Products
            </Link>
            {session && (
              <Link
                href="/account"
                className="text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
                style={{ color: branding?.colors.text }}
              >
                My Account
              </Link>
            )}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-3">
            <Link href={session ? '/account' : '/account'}>
              <button
                className="p-2 rounded-full hover:bg-black/5 transition-colors"
                style={{ color: branding?.colors.text }}
              >
                <User className="h-5 w-5" />
              </button>
            </Link>
            <button
              onClick={toggleCartDrawer}
              className="relative p-2 rounded-full hover:bg-black/5 transition-colors"
              style={{ color: branding?.colors.text }}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-[10px] text-white font-bold w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: branding?.colors.primary }}
                >
                  {cartItemCount}
                </span>
              )}
            </button>
            <button
              className="md:hidden p-2 rounded-full hover:bg-black/5"
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{ color: branding?.colors.text }}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden py-4 border-t space-y-2" style={{ borderColor: `${branding?.colors.text ?? '#000'}15` }}>
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium"
              style={{ color: branding?.colors.text }}
            >
              Products
            </Link>
            <Link
              href="/account"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium"
              style={{ color: branding?.colors.text }}
            >
              {session ? 'My Account' : 'Sign In'}
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}

function Footer() {
  const { config } = useStorefront()
  const branding = config?.branding

  return (
    <footer
      className="border-t mt-auto py-8"
      style={{
        backgroundColor: branding?.colors.secondary ?? '#111',
        color: '#fff',
        borderColor: `${branding?.colors.text ?? '#000'}10`,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-semibold text-lg mb-2">{branding?.name}</h3>
            {branding?.about && (
              <p className="text-sm opacity-70 leading-relaxed">{branding.about.substring(0, 200)}</p>
            )}
          </div>

          {/* Contact */}
          {branding?.contact && (
            <div>
              <h4 className="font-medium mb-2">Contact</h4>
              <div className="space-y-1 text-sm opacity-70">
                {branding.contact.email && <p>{branding.contact.email}</p>}
                {branding.contact.phone && <p>{branding.contact.phone}</p>}
                {branding.contact.address && <p>{branding.contact.address}</p>}
              </div>
            </div>
          )}

          {/* Links & Socials */}
          <div>
            {branding?.socials && branding.socials.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Follow Us</h4>
                <div className="flex gap-3">
                  {branding.socials.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm opacity-70 hover:opacity-100 transition-opacity capitalize"
                    >
                      {s.platform}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {branding?.footer?.links && branding.footer.links.length > 0 && (
              <div className="mt-4">
                {branding.footer.links.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    className="block text-sm opacity-70 hover:opacity-100 transition-opacity py-1"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs opacity-50">
          {branding?.footer?.text ?? `© ${new Date().getFullYear()} ${branding?.name}. All rights reserved.`}
        </div>
      </div>
    </footer>
  )
}

export function StorefrontShell({
  children,
  config,
  slug,
}: {
  children: ReactNode
  config: StorefrontPublicConfig
  slug: string
}) {
  return (
    <StorefrontProvider config={config} slug={slug}>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <StorefrontCartDrawer />
    </StorefrontProvider>
  )
}
