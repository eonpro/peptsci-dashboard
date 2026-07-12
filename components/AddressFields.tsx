'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { US_STATES } from '@/lib/us-states'
import type { Address } from '@/lib/address'
import {
  fetchAddressSuggestions,
  isPlacesAutocompleteConfigured,
  resolveSuggestionToAddress,
  type PlacesSession,
} from '@/lib/google-places'

interface Props {
  value: Partial<Address>
  onChange: (next: Partial<Address>) => void
  idPrefix: string
  dark?: boolean
  disabled?: boolean
}

interface SuggestionItem {
  suggestion: google.maps.places.AutocompleteSuggestion
  mainText: string
  secondaryText: string
}

/**
 * Shared street-address inputs (line1/line2/city/state/zip). `dark` switches
 * to the shop's dark-on-navy palette; otherwise uses default shadcn styling.
 *
 * When NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, the Street Address input
 * offers Google Places (New) suggestions that fill the whole form on select.
 */
export function AddressFields({ value, onChange, idPrefix, dark, disabled }: Props) {
  const inputCls = dark
    ? 'h-12 bg-white/5 border-white/10 text-white rounded-xl'
    : undefined
  const labelCls = dark ? 'text-white/70' : undefined
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch })

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const sessionRef = useRef<PlacesSession>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)
  // Keeps the latest full address value available inside async callbacks.
  const valueRef = useRef(value)
  valueRef.current = value

  const placesEnabled = isPlacesAutocompleteConfigured()

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const closeSuggestions = () => {
    setOpen(false)
    setHighlighted(-1)
  }

  const onStreetChange = (text: string) => {
    set({ address1: text })
    if (!placesEnabled || disabled) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (text.trim().length < 3) {
      setSuggestions([])
      closeSuggestions()
      return
    }
    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeq.current
      try {
        const results = await fetchAddressSuggestions(text, sessionRef.current)
        if (seq !== requestSeq.current) return
        const items = results
          .map((s) => ({
            suggestion: s,
            mainText: s.placePrediction?.mainText?.text ?? '',
            secondaryText: s.placePrediction?.secondaryText?.text ?? '',
          }))
          .filter((s) => s.mainText)
        setSuggestions(items)
        setOpen(items.length > 0)
        setHighlighted(-1)
      } catch {
        // Autocomplete is best-effort; manual entry always works.
        setSuggestions([])
        closeSuggestions()
      }
    }, 250)
  }

  const selectSuggestion = async (item: SuggestionItem) => {
    closeSuggestions()
    setSuggestions([])
    try {
      const addr = await resolveSuggestionToAddress(item.suggestion, sessionRef.current)
      if (!addr) return
      onChange({
        ...valueRef.current,
        ...addr,
        // Keep a suite/unit the user already typed if Google has none.
        address2: addr.address2 || valueRef.current.address2 || '',
      })
    } catch {
      // Leave whatever the user typed in place.
    }
  }

  const onStreetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      void selectSuggestion(suggestions[highlighted])
    } else if (e.key === 'Escape') {
      closeSuggestions()
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 relative">
        <Label htmlFor={`${idPrefix}-address1`} className={labelCls}>
          Street Address *
        </Label>
        <Input
          id={`${idPrefix}-address1`}
          value={value.address1 ?? ''}
          onChange={(e) => onStreetChange(e.target.value)}
          onKeyDown={onStreetKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => {
            // Delay so option onMouseDown wins over blur-close.
            setTimeout(closeSuggestions, 150)
          }}
          className={inputCls}
          disabled={disabled}
          autoComplete={placesEnabled ? 'off' : 'address-line1'}
          role={placesEnabled ? 'combobox' : undefined}
          aria-expanded={placesEnabled ? open : undefined}
          aria-autocomplete={placesEnabled ? 'list' : undefined}
          placeholder={placesEnabled ? 'Start typing your address…' : undefined}
        />
        {open && suggestions.length > 0 && (
          <ul
            role="listbox"
            className={
              dark
                ? 'absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-white/10 bg-brand-onyx shadow-xl overflow-hidden'
                : 'absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden'
            }
          >
            {suggestions.map((item, i) => (
              <li
                key={`${item.mainText}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault()
                  void selectSuggestion(item)
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={[
                  'flex items-start gap-2 px-3 py-2 text-sm cursor-pointer',
                  dark
                    ? i === highlighted
                      ? 'bg-white/10 text-white'
                      : 'text-white/80'
                    : i === highlighted
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-700',
                ].join(' ')}
              >
                <MapPin
                  className={
                    dark
                      ? 'h-4 w-4 mt-0.5 shrink-0 text-white/40'
                      : 'h-4 w-4 mt-0.5 shrink-0 text-gray-400'
                  }
                />
                <span>
                  <span className="font-medium">{item.mainText}</span>
                  {item.secondaryText && (
                    <span className={dark ? 'text-white/50' : 'text-gray-500'}>
                      {' '}
                      {item.secondaryText}
                    </span>
                  )}
                </span>
              </li>
            ))}
            <li
              aria-hidden
              className={
                dark
                  ? 'px-3 py-1 text-[10px] text-white/30 text-right'
                  : 'px-3 py-1 text-[10px] text-gray-400 text-right'
              }
            >
              powered by Google
            </li>
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-address2`} className={labelCls}>
          Suite / Unit (optional)
        </Label>
        <Input
          id={`${idPrefix}-address2`}
          value={value.address2 ?? ''}
          onChange={(e) => set({ address2: e.target.value })}
          className={inputCls}
          disabled={disabled}
          autoComplete="address-line2"
        />
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        <div className="space-y-2 col-span-2 sm:col-span-1">
          <Label htmlFor={`${idPrefix}-city`} className={labelCls}>
            City *
          </Label>
          <Input
            id={`${idPrefix}-city`}
            value={value.city ?? ''}
            onChange={(e) => set({ city: e.target.value })}
            className={inputCls}
            disabled={disabled}
            autoComplete="address-level2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-state`} className={labelCls}>
            State *
          </Label>
          <Select
            value={value.state ?? ''}
            onValueChange={(v) => set({ state: v })}
            disabled={disabled}
          >
            <SelectTrigger
              id={`${idPrefix}-state`}
              className={dark ? 'h-12 bg-white/5 border-white/10 text-white rounded-xl' : undefined}
            >
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent className={dark ? 'bg-brand-onyx border-white/10 max-h-[300px]' : 'max-h-[300px]'}>
              {US_STATES.map((s) => (
                <SelectItem
                  key={s.code}
                  value={s.code}
                  className={dark ? 'text-white focus:bg-white/10 focus:text-white' : undefined}
                >
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-zip`} className={labelCls}>
            ZIP *
          </Label>
          <Input
            id={`${idPrefix}-zip`}
            value={value.zip ?? ''}
            onChange={(e) => set({ zip: e.target.value })}
            className={inputCls}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="postal-code"
          />
        </div>
      </div>
    </div>
  )
}
