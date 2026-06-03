'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface CustomerAvatarProps {
  name: string
  email?: string
  className?: string
}

export function CustomerAvatar({ name, email, className }: CustomerAvatarProps) {
  // Generate initials from name
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Generate a consistent color based on the name
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-red-500',
    'bg-orange-500',
  ]

  const colorSeed = `${name}${email ?? ''}`
  const colorIndex =
    colorSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  const bgColor = colors[colorIndex]

  return (
    <Avatar className={className}>
      <AvatarImage
        src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`}
        alt={name}
      />
      <AvatarFallback className={`${bgColor} text-white`}>{initials}</AvatarFallback>
    </Avatar>
  )
}
