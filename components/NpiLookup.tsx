'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Loader2, Search, BadgeCheck } from 'lucide-react'
import type { NormalizedProvider } from '@/lib/npi'

interface Props {
  onSelect: (provider: NormalizedProvider) => void
  dark?: boolean
  placeholder?: string
}

/**
 * Search the NPPES registry by NPI number or provider/practice name and let
 * the user pick the matching provider. Debounced; calls /api/npi/lookup.
 */
export function NpiLookup({ onSelect, dark, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NormalizedProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const digits = query.replace(/\D/g, '')
    const isNumber = digits.length === 10
    const term = query.trim()
    if (!isNumber && term.length < 2) {
      setResults([])
      setError(null)
      return
    }

    let active = true
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const qs = isNumber
          ? `number=${encodeURIComponent(digits)}`
          : `name=${encodeURIComponent(term)}`
        const res = await fetch(`/api/npi/lookup?${qs}`)
        const data = await res.json()
        if (!active) return
        if (!res.ok) {
          setResults([])
          setError(data.message || 'Lookup failed')
          setOpen(true)
          return
        }
        setResults(data.providers ?? [])
        setOpen(true)
        if ((data.providers ?? []).length === 0) {
          setError('No matching provider found in the NPI registry')
        }
      } catch {
        if (active) setError('Could not reach the NPI registry')
      } finally {
        if (active) setLoading(false)
      }
    }, 400)

    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [query])

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const inputCls = dark
    ? 'h-12 bg-white/5 border-white/10 text-white rounded-xl pl-10'
    : 'pl-10'

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${dark ? 'text-white/40' : 'text-muted-foreground'}`}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? 'Enter NPI number or provider / practice name'}
          className={inputCls}
          autoComplete="off"
        />
        {loading && (
          <Loader2
            className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin ${dark ? 'text-white/40' : 'text-muted-foreground'}`}
          />
        )}
      </div>

      {open && (results.length > 0 || error) && (
        <div
          className={`absolute z-50 mt-2 w-full rounded-xl border shadow-xl overflow-hidden ${
            dark ? 'bg-[#0a0e3a] border-white/10' : 'bg-white border-gray-200'
          }`}
        >
          {error && results.length === 0 ? (
            <div className={`p-3 text-sm ${dark ? 'text-white/60' : 'text-gray-500'}`}>{error}</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {results.map((p) => (
                <li key={p.npiNumber}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(p)
                      setQuery(p.providerName)
                      setOpen(false)
                    }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                      dark ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                    }`}
                  >
                    <BadgeCheck
                      className={`h-4 w-4 mt-0.5 flex-shrink-0 ${dark ? 'text-[#8b95ff]' : 'text-brand-primary'}`}
                    />
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${dark ? 'text-white' : 'text-gray-900'}`}>
                        {p.providerName}
                      </span>
                      <span className={`block text-xs ${dark ? 'text-white/50' : 'text-gray-500'}`}>
                        NPI {p.npiNumber}
                        {p.practiceAddress?.city
                          ? ` • ${p.practiceAddress.city}, ${p.practiceAddress.state}`
                          : ''}
                        {p.primaryTaxonomy ? ` • ${p.primaryTaxonomy}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
