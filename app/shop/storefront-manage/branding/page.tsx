'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { BrandingConfig } from '@/lib/types/storefront'

const GOOGLE_FONTS = [
  'Inter', 'Poppins', 'Montserrat', 'Open Sans', 'Lato', 'Roboto', 'Playfair Display',
  'Merriweather', 'Source Sans 3', 'Raleway', 'DM Sans', 'Work Sans', 'Nunito',
]

export default function BrandingPage() {
  const [branding, setBranding] = useState<BrandingConfig>({
    name: '',
    colors: { primary: '#213cef', secondary: '#050722', accent: '#10b981', background: '#ffffff', text: '#111827' },
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/clinic/storefront')
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        if (data.brandingConfig) setBranding(data.brandingConfig)
        else setBranding((b) => ({ ...b, name: data.name }))
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/clinic/storefront', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandingConfig: branding }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  function updateColors(key: string, value: string) {
    setBranding((b) => ({ ...b, colors: { ...b.colors, [key]: value } }))
  }

  if (loading) {
    return <div><div className="h-64 bg-white/5 rounded animate-pulse" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/shop/storefront-manage">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Branding</h1>
          <p className="text-sm text-white/60">Customize your storefront appearance</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </Button>
      </div>

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Your store name and logo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Store Name</Label>
            <Input value={branding.name} onChange={(e) => setBranding((b) => ({ ...b, name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Logo URL</Label>
            <Input
              value={branding.logo ?? ''}
              onChange={(e) => setBranding((b) => ({ ...b, logo: e.target.value }))}
              placeholder="https://example.com/logo.png"
            />
            {branding.logo && (
              <div className="mt-2 p-4 bg-white/10 rounded-lg flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logo} alt="Logo preview" className="max-h-16 object-contain" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Favicon URL</Label>
            <Input
              value={branding.favicon ?? ''}
              onChange={(e) => setBranding((b) => ({ ...b, favicon: e.target.value }))}
              placeholder="https://example.com/favicon.ico"
            />
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Colors</CardTitle>
          <CardDescription>Define your brand palette</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(branding.colors).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs capitalize">{key}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => updateColors(key, e.target.value)}
                    className="h-9 w-9 rounded border cursor-pointer"
                  />
                  <Input value={value} onChange={(e) => updateColors(key, e.target.value)} className="text-sm h-9" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: branding.colors.background }}>
            <p className="text-sm font-medium" style={{ color: branding.colors.text }}>
              Preview text on your background
            </p>
            <div className="flex gap-2 mt-2">
              <div className="px-3 py-1 rounded text-xs text-white" style={{ backgroundColor: branding.colors.primary }}>
                Primary
              </div>
              <div className="px-3 py-1 rounded text-xs text-white" style={{ backgroundColor: branding.colors.secondary }}>
                Secondary
              </div>
              <div className="px-3 py-1 rounded text-xs text-white" style={{ backgroundColor: branding.colors.accent }}>
                Accent
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fonts */}
      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <CardDescription>Choose fonts from Google Fonts</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {(['heading', 'body'] as const).map((type) => (
            <div key={type} className="space-y-2">
              <Label className="capitalize">{type} Font</Label>
              <select
                value={branding.fonts?.[type] ?? ''}
                onChange={(e) =>
                  setBranding((b) => ({
                    ...b,
                    fonts: { ...b.fonts, [type]: e.target.value || undefined },
                  }))
                }
                className="w-full h-9 px-3 border rounded-md text-sm bg-white"
              >
                <option value="">Default (System)</option>
                {GOOGLE_FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Hero */}
      <Card>
        <CardHeader>
          <CardTitle>Hero Section</CardTitle>
          <CardDescription>The main banner on your storefront homepage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Headline</Label>
            <Input
              value={branding.hero?.title ?? ''}
              onChange={(e) => setBranding((b) => ({ ...b, hero: { ...b.hero, title: e.target.value } }))}
              placeholder="Welcome to Our Wellness Store"
            />
          </div>
          <div className="space-y-2">
            <Label>Subtitle</Label>
            <Input
              value={branding.hero?.subtitle ?? ''}
              onChange={(e) =>
                setBranding((b) => ({
                  ...b,
                  hero: { title: b.hero?.title ?? '', ...b.hero, subtitle: e.target.value },
                }))
              }
              placeholder="Premium peptides for your health"
            />
          </div>
          <div className="space-y-2">
            <Label>Background Image URL</Label>
            <Input
              value={branding.hero?.backgroundImage ?? ''}
              onChange={(e) =>
                setBranding((b) => ({
                  ...b,
                  hero: { title: b.hero?.title ?? '', ...b.hero, backgroundImage: e.target.value },
                }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>CTA Button Text</Label>
            <Input
              value={branding.hero?.cta ?? ''}
              onChange={(e) =>
                setBranding((b) => ({
                  ...b,
                  hero: { title: b.hero?.title ?? '', ...b.hero, cta: e.target.value },
                }))
              }
              placeholder="Shop Now"
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact & About */}
      <Card>
        <CardHeader>
          <CardTitle>About & Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>About Text</Label>
            <Textarea
              value={branding.about ?? ''}
              onChange={(e) => setBranding((b) => ({ ...b, about: e.target.value }))}
              placeholder="Tell your customers about your practice..."
              className="min-h-[100px]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={branding.contact?.email ?? ''}
                onChange={(e) => setBranding((b) => ({ ...b, contact: { ...b.contact, email: e.target.value } }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={branding.contact?.phone ?? ''}
                onChange={(e) => setBranding((b) => ({ ...b, contact: { ...b.contact, phone: e.target.value } }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={branding.contact?.address ?? ''}
                onChange={(e) => setBranding((b) => ({ ...b, contact: { ...b.contact, address: e.target.value } }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <Card>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Footer Text</Label>
            <Input
              value={branding.footer?.text ?? ''}
              onChange={(e) =>
                setBranding((b) => ({ ...b, footer: { ...b.footer, text: e.target.value } }))
              }
              placeholder="© 2026 Your Clinic. All rights reserved."
            />
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader>
          <CardTitle>Social Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(branding.socials ?? []).map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={s.platform}
                onChange={(e) => {
                  const socials = [...(branding.socials ?? [])]
                  socials[i] = { ...socials[i], platform: e.target.value }
                  setBranding((b) => ({ ...b, socials }))
                }}
                placeholder="Platform"
                className="w-32"
              />
              <Input
                value={s.url}
                onChange={(e) => {
                  const socials = [...(branding.socials ?? [])]
                  socials[i] = { ...socials[i], url: e.target.value }
                  setBranding((b) => ({ ...b, socials }))
                }}
                placeholder="https://..."
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const socials = (branding.socials ?? []).filter((_, j) => j !== i)
                  setBranding((b) => ({ ...b, socials }))
                }}
                className="text-red-500 hover:text-red-700"
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setBranding((b) => ({
                ...b,
                socials: [...(b.socials ?? []), { platform: '', url: '' }],
              }))
            }
          >
            + Add Social Link
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Changes'}
        </Button>
      </div>
    </div>
  )
}
