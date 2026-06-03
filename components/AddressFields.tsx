'use client'

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

interface Props {
  value: Partial<Address>
  onChange: (next: Partial<Address>) => void
  idPrefix: string
  dark?: boolean
  disabled?: boolean
}

/**
 * Shared street-address inputs (line1/line2/city/state/zip). `dark` switches
 * to the shop's dark-on-navy palette; otherwise uses default shadcn styling.
 */
export function AddressFields({ value, onChange, idPrefix, dark, disabled }: Props) {
  const inputCls = dark
    ? 'h-12 bg-white/5 border-white/10 text-white rounded-xl'
    : undefined
  const labelCls = dark ? 'text-white/70' : undefined
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-address1`} className={labelCls}>
          Street Address *
        </Label>
        <Input
          id={`${idPrefix}-address1`}
          value={value.address1 ?? ''}
          onChange={(e) => set({ address1: e.target.value })}
          className={inputCls}
          disabled={disabled}
          autoComplete="address-line1"
        />
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
            <SelectContent className={dark ? 'bg-[#050722] border-white/10 max-h-[300px]' : 'max-h-[300px]'}>
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
