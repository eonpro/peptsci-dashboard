'use client'

import { useLayoutEffect } from 'react'

/**
 * Applies the theme class to <html> while the owning layout is mounted.
 *
 * Why: Radix primitives (Dialog/Select/Sheet/Popover/DropdownMenu/Command)
 * portal to document.body. When the `.dark` class only lives on an inner
 * layout wrapper, portaled content escapes the dark token scope and renders
 * with :root (light) tokens — the recurring "white dialog on a dark page"
 * bug. Hoisting the class to <html> makes portals inherit the correct theme.
 *
 * Layouts should KEEP their local `.dark` wrapper class as well: that keeps
 * server-rendered, in-tree content correct before hydration (no flash), while
 * this component covers everything portaled after hydration.
 */
export function ThemeScope({ theme }: { theme: 'dark' | 'light' }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      return () => {
        root.classList.remove('dark')
      }
    }
    root.classList.remove('dark')
    return undefined
  }, [theme])

  return null
}
