'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, User, LogOut, ShoppingBag, Mail, Lock, Loader2 } from 'lucide-react'
import { useStorefront } from '@/components/storefront/StorefrontContext'

export default function AccountPage() {
  const { config, slug, session, setSession } = useStorefront()
  const branding = config?.branding
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/storefront/auth?action=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          email,
          password,
          ...(mode === 'register' ? { firstName, lastName } : {}),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Something went wrong')
        return
      }

      setSession({ token: data.token, email })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${branding?.colors.primary}15` }}
          >
            <User className="h-8 w-8" style={{ color: branding?.colors.primary }} />
          </div>
          <h1 className="text-2xl font-bold">My Account</h1>
          <p className="text-sm text-gray-500 mt-1">{session.email}</p>
        </div>

        <div className="space-y-3">
          <Link
            href="/account/orders"
            className="flex items-center gap-3 p-4 border rounded-xl hover:shadow-sm transition-shadow"
          >
            <ShoppingBag className="h-5 w-5" style={{ color: branding?.colors.primary }} />
            <div>
              <p className="font-medium text-sm">Order History</p>
              <p className="text-xs text-gray-500">View your past orders</p>
            </div>
          </Link>
        </div>

        <button
          onClick={() => setSession(null)}
          className="flex items-center gap-2 mt-8 text-sm text-red-500 hover:text-red-700 transition-colors mx-auto"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm mb-6 opacity-60 hover:opacity-100 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Store
      </Link>

      <h1 className="text-2xl font-bold mb-2">
        {mode === 'login' ? 'Sign In' : 'Create Account'}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {mode === 'login'
          ? 'Sign in to view your orders and manage your account.'
          : 'Create an account to track your orders.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600">Email</label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">Password</label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: branding?.colors.primary ?? '#213cef' }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        {mode === 'login' ? (
          <>
            Don&apos;t have an account?{' '}
            <button onClick={() => setMode('register')} className="font-medium" style={{ color: branding?.colors.primary }}>
              Register
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button onClick={() => setMode('login')} className="font-medium" style={{ color: branding?.colors.primary }}>
              Sign In
            </button>
          </>
        )}
      </p>
    </div>
  )
}
