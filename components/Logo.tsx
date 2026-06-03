'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

interface LogoProps {
  className?: string
  variant?: 'light' | 'dark' | 'auto'
  width?: number
  height?: number
}

export function Logo({ className = '', variant = 'auto', width = 150, height = 50 }: LogoProps) {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    if (variant === 'auto') {
      // Check if dark mode is enabled
      const checkDarkMode = () => {
        const isDark = document.documentElement.classList.contains('dark')
        setIsDarkMode(isDark)
      }

      checkDarkMode()

      // Watch for changes
      const observer = new MutationObserver(checkDarkMode)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })

      return () => observer.disconnect()
    }
  }, [variant])

  const logoSrc =
    variant === 'light' || (variant === 'auto' && isDarkMode)
      ? 'https://static.wixstatic.com/media/c49a9b_a7d9e44fe804486b95fd734d0e3bea8e~mv2.png'
      : 'https://static.wixstatic.com/media/c49a9b_dc1a4a002b144f1fbabb0bcc9b1fa5e2~mv2.png'

  return (
    <Image
      src={logoSrc}
      alt="PEPTSCI"
      width={width}
      height={height}
      className={className}
      style={{ width: 'auto', height: 'auto' }}
      priority
    />
  )
}
