import type { PeptideMonograph } from '@/lib/types/monograph'
import type { ShopProduct } from '@/lib/types/shop'
import { BookOpen, FlaskConical, Microscope, FileText } from 'lucide-react'

const DEFAULT_DISCLAIMER =
  'For research use only. Not for human or veterinary use. Statements describe publicly reported research and are not approved indications or therapeutic claims.'

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6 md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/15 text-[#7d90ff]">
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/** Split "Bold lead-in: rest of sentence" so the lead-in can be emphasized. */
function splitLead(text: string): { lead?: string; rest: string } {
  const idx = text.indexOf(':')
  if (idx > 0 && idx < 64) {
    return { lead: text.slice(0, idx).trim(), rest: text.slice(idx + 1).trim() }
  }
  return { rest: text }
}

interface SpecItem {
  label: string
  value: string
}

function SpecificationsStrip({ product }: { product: ShopProduct }) {
  const specs: SpecItem[] = []
  if (product.casNumber) specs.push({ label: 'CAS #', value: product.casNumber })
  if (product.molecularFormula) specs.push({ label: 'Molecular Formula', value: product.molecularFormula })
  if (product.molecularWeight) specs.push({ label: 'Molar Mass', value: product.molecularWeight })
  specs.push({ label: 'Purity', value: product.purity || '99%' })
  const doses =
    product.availableDoses && product.availableDoses.length > 0
      ? product.availableDoses
      : product.dose
        ? [product.dose]
        : []
  if (doses.length > 0) specs.push({ label: 'Available In', value: doses.join(', ') })

  if (specs.length === 0) return null

  return (
    <div className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6 md:p-8">
      <h2 className="mb-4 text-lg font-semibold text-white">Specifications</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {specs.map((s) => (
          <div key={s.label}>
            <dt className="text-xs uppercase tracking-wide text-white/40">{s.label}</dt>
            <dd className="mt-1 text-sm font-medium text-white break-words">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Rich, catalog-style monograph shown on the product detail page: Overview,
 * Mechanism of Action, Observations from research, Specifications, and
 * Clinical References. Renders only the sections that have content.
 */
export function ProductMonograph({
  monograph,
  product,
}: {
  monograph: PeptideMonograph
  product: ShopProduct
}) {
  const { overview, mechanismOfAction, observations, references } = monograph
  const disclaimer = monograph.disclaimer || DEFAULT_DISCLAIMER

  return (
    <div className="space-y-6">
      <SpecificationsStrip product={product} />

      {overview.length > 0 && (
        <Section icon={<BookOpen className="h-5 w-5" />} title="Overview">
          <div className="space-y-3 text-sm md:text-base leading-relaxed text-white/75">
            {overview.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </Section>
      )}

      {mechanismOfAction.length > 0 && (
        <Section icon={<FlaskConical className="h-5 w-5" />} title="Mechanism of Action (Research Findings)">
          <ul className="space-y-3">
            {mechanismOfAction.map((item, i) => {
              const { lead, rest } = splitLead(item)
              return (
                <li key={i} className="flex gap-3 text-sm md:text-base text-white/75">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                  <span>
                    {lead && <span className="font-semibold text-white">{lead}: </span>}
                    {rest}
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {observations.length > 0 && (
        <Section
          icon={<Microscope className="h-5 w-5" />}
          title="Observations From Research"
        >
          <p className="mb-4 text-xs text-white/40">
            All findings below are experimental, in vitro, animal, or early-phase clinical research.
            Not intended as treatment claims.
          </p>
          <ul className="space-y-3">
            {observations.map((o, i) => (
              <li key={i} className="flex gap-3 text-sm md:text-base text-white/75">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                <span>
                  {o.title && <span className="font-semibold text-white">{o.title}: </span>}
                  {o.detail}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {references.length > 0 && (
        <Section icon={<FileText className="h-5 w-5" />} title="Clinical References">
          <ol className="space-y-2 text-sm text-white/60">
            {references.map((ref, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-white/40">{i + 1}.</span>
                {ref.url ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#7d90ff] hover:text-blue-300 hover:underline break-words"
                  >
                    {ref.label}
                  </a>
                ) : (
                  <span className="break-words">{ref.label}</span>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <p className="px-2 text-xs leading-relaxed text-white/40">{disclaimer}</p>
    </div>
  )
}
