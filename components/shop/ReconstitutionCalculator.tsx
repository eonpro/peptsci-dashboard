'use client'

import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import {
  calculateReconstitution,
  formatReconNumber,
  parseTotalVialMg,
} from '@/lib/reconstitution'
import {
  getDefaultProtocol,
  getProtocolForName,
  type PeptideProtocol,
} from '@/lib/content/peptide-protocols'
import { cn } from '@/lib/utils'

const DISCLAIMER =
  'For research use only. Not for human or veterinary use. Protocol ranges describe commonly cited research literature and are not medical advice. Always consult published protocols.'

type Props = {
  productName: string
  doseLabel: string
  className?: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function ProtocolCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs leading-snug text-white/50">{detail}</p>
    </div>
  )
}

function SliderRow({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  display: string
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-[#7d90ff]">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
        className={cn(
          '[&>span:first-child]:bg-white/15 [&>span:first-child>span]:bg-[#213cef]',
          '[&_[role=slider]]:border-[#213cef] [&_[role=slider]]:bg-white',
          '[&_[role=slider]]:ring-offset-[#0a0e3a]'
        )}
      />
    </div>
  )
}

export function ReconstitutionCalculator({ productName, doseLabel, className }: Props) {
  const vialFromSku = parseTotalVialMg(doseLabel)
  const authored = getProtocolForName(productName)
  const protocol: PeptideProtocol = authored ?? getDefaultProtocol(vialFromSku || 10)

  const initialVialMg = vialFromSku > 0 ? vialFromSku : protocol.typicalVialMg ?? 10
  const vialMax = Math.max(50, Math.ceil(initialVialMg * 2))
  const doseMax = Math.max(2000, protocol.defaultDoseMcg * 4, Math.round(initialVialMg * 1000))

  const [vialMg, setVialMg] = useState(() => clamp(initialVialMg, 1, vialMax))
  const [waterMl, setWaterMl] = useState(() =>
    clamp(protocol.recommendedBacWaterMl, 0.5, 5)
  )
  const [desiredDoseMcg, setDesiredDoseMcg] = useState(() =>
    clamp(protocol.defaultDoseMcg, 10, doseMax)
  )

  const result = useMemo(
    () => calculateReconstitution({ vialMg, waterMl, desiredDoseMcg }),
    [vialMg, waterMl, desiredDoseMcg]
  )

  return (
    <section
      className={cn(
        'rounded-2xl border border-white/10 bg-[#0a0e3a] p-6 md:p-8',
        className
      )}
    >
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[#7d90ff] md:text-2xl">Reconstitution Calculator</h2>
        <p className="mt-1 text-sm text-white/55">
          Adjust the sliders below to calculate reconstitution volumes and dosing for{' '}
          <span className="text-white/80">{productName}</span>
          {doseLabel ? (
            <>
              {' '}
              (<span className="tabular-nums text-white/70">{doseLabel}</span>)
            </>
          ) : null}
          .
        </p>
      </div>

      {/* Recommended protocol strip */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <ProtocolCard
          label="Recommended reconstitution"
          value={`${formatReconNumber(protocol.recommendedBacWaterMl, 1)} ml BAC water`}
          detail={
            protocol.reconstitutionNote ??
            'Suggested bacteriostatic water volume for unit-readable concentration.'
          }
        />
        <ProtocolCard
          label="Daily dosage"
          value={protocol.daily.range}
          detail={protocol.daily.schedule}
        />
        <ProtocolCard
          label="Weekly dosage"
          value={protocol.weekly.range}
          detail={protocol.weekly.schedule}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        {/* Sliders */}
        <div className="space-y-7">
          <SliderRow
            label="Vial quantity"
            display={`${formatReconNumber(vialMg, 1)} mg`}
            value={vialMg}
            min={1}
            max={vialMax}
            step={vialMax > 20 ? 1 : 0.5}
            onChange={setVialMg}
          />
          <SliderRow
            label="Bacteriostatic water"
            display={`${formatReconNumber(waterMl, 1)} ml`}
            value={waterMl}
            min={0.5}
            max={5}
            step={0.1}
            onChange={setWaterMl}
          />
          <SliderRow
            label="Desired dose"
            display={`${formatReconNumber(desiredDoseMcg, 0)} mcg`}
            value={desiredDoseMcg}
            min={10}
            max={doseMax}
            step={desiredDoseMcg >= 1000 ? 50 : 10}
            onChange={setDesiredDoseMcg}
          />

          <div className="flex gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-xs leading-relaxed text-white/55">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#7d90ff]" aria-hidden />
            <p>{DISCLAIMER}</p>
          </div>
        </div>

        {/* Results */}
        <div className="rounded-2xl border border-white/10 bg-[#050722]/80 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Injection volume
          </p>
          <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight text-[#7d90ff] md:text-6xl">
            {result ? formatReconNumber(result.syringeUnits, 1) : '—'}
          </p>
          <p className="mt-1 text-sm text-white/50">Units (on 100-unit syringe)</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Concentration
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {result ? `${formatReconNumber(result.concentrationMgPerMl, 1)} mg/ml` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Doses / vial
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {result ? formatReconNumber(result.dosesPerVial, 0) : '—'}
              </p>
            </div>
          </div>

          {result && (
            <p className="mt-4 text-xs text-white/40">
              Draw volume ≈ {formatReconNumber(result.injectionVolumeMl, 3)} ml per dose
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
