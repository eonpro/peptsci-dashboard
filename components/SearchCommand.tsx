'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Users, Package, DollarSign, ShoppingCart, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SearchResult } from '@/lib/search'

interface SearchCommandProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const typeIcons = {
  customer: Users,
  order: ShoppingCart,
  product: DollarSign,
  inventory: Package,
}

const typeLabels = {
  customer: 'Customers',
  order: 'Orders',
  product: 'Products',
  inventory: 'Inventory',
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`)

      if (!response.ok) {
        if (response.status === 401) {
          setError('Please sign in to search')
          return
        }
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.results || [])
    } catch (err) {
      console.error('Search error:', err)
      setError('Failed to search. Please try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query)
    }, 300)

    return () => clearTimeout(timer)
  }, [query, performSearch])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setError(null)
    }
  }, [open])

  // Handle selection
  const handleSelect = (result: SearchResult) => {
    onOpenChange(false)
    router.push(result.href)
  }

  // Group results by type
  const groupedResults = results.reduce(
    (acc, result) => {
      if (!acc[result.type]) {
        acc[result.type] = []
      }
      acc[result.type].push(result)
      return acc
    },
    {} as Record<string, SearchResult[]>
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command className="rounded-lg border shadow-md">
        <CommandInput
          placeholder="Search customers, orders, products..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
            </div>
          )}

          {error && <div className="py-6 text-center text-sm text-red-500">{error}</div>}

          {!loading && !error && query.length >= 2 && results.length === 0 && (
            <CommandEmpty>No results found for &quot;{query}&quot;</CommandEmpty>
          )}

          {!loading && !error && query.length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}

          {!loading &&
            !error &&
            Object.entries(groupedResults).map(([type, items]) => {
              const Icon = typeIcons[type as keyof typeof typeIcons]
              const label = typeLabels[type as keyof typeof typeLabels]

              return (
                <CommandGroup key={type} heading={label}>
                  {items.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.title} ${result.subtitle}`}
                      onSelect={() => handleSelect(result)}
                      className="cursor-pointer"
                    >
                      <Icon
                        className={cn(
                          'mr-2 h-4 w-4',
                          type === 'customer' && 'text-blue-500',
                          type === 'order' && 'text-green-500',
                          type === 'product' && 'text-purple-500',
                          type === 'inventory' && 'text-orange-500'
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{result.title}</span>
                        <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

export default SearchCommand
