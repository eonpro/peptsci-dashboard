'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Store,
  Package,
  ShoppingCart,
  Users,
  Palette,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { BrandingConfig } from '@/lib/types/storefront'

interface StorefrontDetail {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED'
  brandingConfig: BrandingConfig | null
  clientId: string
  createdAt: string
  updatedAt: string
  client: { organizationName: string; contactEmail: string | null }
  _count: { products: number; retailOrders: number; endCustomers: number }
}

const STATUS_CONFIG = {
  ACTIVE: { label: 'Active', variant: 'default' as const, icon: CheckCircle2, color: 'text-emerald-400' },
  DRAFT: { label: 'Draft', variant: 'secondary' as const, icon: Clock, color: 'text-amber-400' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' as const, icon: XCircle, color: 'text-red-400' },
}

export default function StorefrontDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [sf, setSf] = useState<StorefrontDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editBranding, setEditBranding] = useState<BrandingConfig>({
    name: '',
    colors: { primary: '#213cef', secondary: '#050722', accent: '#10b981', background: '#ffffff', text: '#111827' },
  })
  const [copied, setCopied] = useState(false)

  const fetchStorefront = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/storefronts/${id}`)
      if (!res.ok) {
        router.push('/storefronts')
        return
      }
      const data = await res.json()
      setSf(data)
      setEditName(data.name)
      setEditSlug(data.slug)
      if (data.brandingConfig) {
        setEditBranding(data.brandingConfig)
      } else {
        setEditBranding((b) => ({ ...b, name: data.name }))
      }
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchStorefront()
  }, [fetchStorefront])

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/admin/storefronts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          slug: editSlug,
          brandingConfig: editBranding,
        }),
      })
      fetchStorefront()
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED') {
    await fetch(`/api/admin/storefronts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchStorefront()
  }

  function copyUrl() {
    if (!sf) return
    navigator.clipboard.writeText(`https://${sf.slug}.peptsci.com`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-white/10 rounded w-1/3" />
        <div className="h-64 bg-white/5 rounded" />
      </div>
    )
  }

  if (!sf) return null

  const statusCfg = STATUS_CONFIG[sf.status]
  const StatusIcon = statusCfg.icon

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/storefronts">
          <Button variant="ghost" size="icon" className="text-white/50 hover:text-white hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{sf.name}</h1>
            <Badge variant={statusCfg.variant}>
              <StatusIcon className={`h-3 w-3 mr-1 ${statusCfg.color}`} />
              {statusCfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-white/40">{sf.slug}.peptsci.com</span>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-white/30 hover:text-white" onClick={copyUrl}>
              {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          {sf.status !== 'ACTIVE' && (
            <Button onClick={() => handleStatusChange('ACTIVE')} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}
          {sf.status === 'ACTIVE' && (
            <a href={`https://${sf.slug}.peptsci.com`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                <ExternalLink className="h-4 w-4 mr-2" />
                Visit Store
              </Button>
            </a>
          )}
          {sf.status !== 'SUSPENDED' && (
            <Button onClick={() => handleStatusChange('SUSPENDED')} variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-400/10">
              <XCircle className="h-4 w-4 mr-2" />
              Suspend
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Products', value: sf._count.products, icon: Package, href: '#' },
          { label: 'Orders', value: sf._count.retailOrders, icon: ShoppingCart, href: '#' },
          { label: 'Customers', value: sf._count.endCustomers, icon: Users, href: '#' },
          { label: 'Clinic', value: sf.client.organizationName, icon: Store, href: `/customers/${encodeURIComponent(sf.client.contactEmail || sf.clientId)}` },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="bg-[#0a0e3a] border-white/10">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/5">
                    <Icon className="h-5 w-5 text-white/50" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40">{stat.label}</p>
                    <p className="text-lg font-semibold text-white">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Settings */}
        <Card className="bg-[#0a0e3a] border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Store className="h-5 w-5" />
              Basic Settings
            </CardTitle>
            <CardDescription className="text-white/50">
              Core storefront configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Store Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Subdomain Slug</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="bg-white/5 border-white/20 text-white"
                />
                <span className="text-white/30 text-sm whitespace-nowrap">.peptsci.com</span>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-[#213cef] hover:bg-[#1a30c0] text-white">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Branding */}
        <Card className="bg-[#0a0e3a] border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Branding
            </CardTitle>
            <CardDescription className="text-white/50">
              Colors and visual identity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Logo URL</Label>
              <Input
                value={editBranding.logo ?? ''}
                onChange={(e) => setEditBranding((b) => ({ ...b, logo: e.target.value }))}
                placeholder="https://..."
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(editBranding.colors).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-white/70 text-xs capitalize">{key}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) =>
                        setEditBranding((b) => ({
                          ...b,
                          colors: { ...b.colors, [key]: e.target.value },
                        }))
                      }
                      className="h-8 w-8 rounded border border-white/20 bg-transparent cursor-pointer"
                    />
                    <Input
                      value={value}
                      onChange={(e) =>
                        setEditBranding((b) => ({
                          ...b,
                          colors: { ...b.colors, [key]: e.target.value },
                        }))
                      }
                      className="bg-white/5 border-white/20 text-white text-xs h-8"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">About / Description</Label>
              <Textarea
                value={editBranding.about ?? ''}
                onChange={(e) => setEditBranding((b) => ({ ...b, about: e.target.value }))}
                placeholder="Tell customers about this clinic..."
                className="bg-white/5 border-white/20 text-white min-h-[80px]"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-[#213cef] hover:bg-[#1a30c0] text-white">
              {saving ? 'Saving...' : 'Save Branding'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
