import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { Logo } from '@/components/Logo'
import { FOOTER_DISCLAIMER } from '@/lib/legal/terms-of-service'

interface LegalPageProps {
  title: string
  lastUpdated: string
  markdown: string
}

/** Shared dark-themed layout for public legal pages (/terms-of-use, /privacy-policy, ...). */
export function LegalPage({ title, lastUpdated, markdown }: LegalPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-onyx font-sofia text-white">
      {/* Ambient gradient glows (same treatment as the landing / auth screens) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[150px]" />
        <div className="absolute bottom-[-18%] left-[6%] h-[460px] w-[460px] rounded-full bg-brand-primary/25 blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[2%] h-[420px] w-[420px] rounded-full bg-[#7a5bff]/20 blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 py-14">
        <Link href="/" aria-label="Back to home">
          <Logo variant="light" width={184} height={62} />
        </Link>

        <h1 className="mt-10 text-center text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-white/50">Last Updated: {lastUpdated}</p>

        <article className="mt-10 w-full rounded-2xl bg-white/5 p-8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)] sm:p-10">
          <ReactMarkdown
            components={{
              h2: ({ children }) => (
                <h2 className="mb-4 mt-10 text-lg font-semibold tracking-wide text-white first:mt-0">
                  {children}
                </h2>
              ),
              p: ({ children }) => (
                <p className="mb-4 text-sm leading-relaxed text-white/75 last:mb-0">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/75">
                  {children}
                </ul>
              ),
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold text-white/95">{children}</strong>
              ),
              a: ({ href, children }) => (
                <a href={href} className="text-[#8b95ff] transition-colors hover:text-white">
                  {children}
                </a>
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </article>

        <p className="mt-10 max-w-2xl text-center text-xs leading-relaxed text-white/40">
          {FOOTER_DISCLAIMER}
        </p>

        <div className="mt-6 flex items-center gap-2 text-xs text-white/30">
          <Link href="/" className="transition-colors hover:text-white/60">
            peptsci.com
          </Link>
          <span aria-hidden>•</span>
          <span>© {new Date().getFullYear()} PeptSci</span>
        </div>
      </div>
    </div>
  )
}
