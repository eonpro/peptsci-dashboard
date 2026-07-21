import ReactMarkdown from 'react-markdown'

/**
 * Dark-themed markdown renderer for client-portal resource articles.
 * Mirrors the typography treatment of the legal pages (components/legal/
 * LegalPage.tsx) with a slightly larger reading size for long-form content.
 */
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="mb-4 mt-10 text-2xl font-semibold tracking-tight text-white first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-4 mt-10 text-xl font-semibold tracking-tight text-white first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-3 mt-8 text-lg font-semibold text-white first:mt-0">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-5 text-[15px] leading-relaxed text-white/75 last:mb-0">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-5 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/75">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-5 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-white/75">
            {children}
          </ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-white/95">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-white/80">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#8b95ff] underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-5 border-l-2 border-brand-primary/60 pl-4 text-[15px] italic text-white/65">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-8 border-white/10" />,
        code: ({ children }) => (
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-[13px] text-white/90">
            {children}
          </code>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  )
}
