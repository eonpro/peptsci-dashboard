/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.wixstatic.com',
        pathname: '/media/**',
      },
    ],
  },
  // Strip console.* (except error/warn) from production client/server bundles.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Per-module imports for large barrel packages so only the icons/functions
    // actually used are bundled (smaller first-load JS, faster builds).
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'date-fns-tz',
      'recharts',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-popover',
    ],
  },
  // The label PDF engine reads the artwork template + brand fonts from disk at
  // runtime. Next.js does NOT bundle `public/` into serverless functions, so on
  // Vercel these reads fail and the engine falls back to a plain vector label.
  // Force-trace the assets into the label route functions so they're available.
  outputFileTracingIncludes: {
    '/api/admin/inventory/labels/pdf': ['./public/labels/**/*', './public/fonts/labels/**/*'],
    '/api/admin/orders/[id]/labels/pdf': ['./public/labels/**/*', './public/fonts/labels/**/*'],
    // The runtime migration runner reads the SQL files at request time; Next.js
    // doesn't bundle prisma/migrations into the function unless we trace them.
    '/api/admin/db/migrate': ['./prisma/migrations/**/*'],
  },
}

export default nextConfig
