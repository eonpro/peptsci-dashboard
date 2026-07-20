'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#213cef] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a30c4]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy text'}
    </button>
  )
}
