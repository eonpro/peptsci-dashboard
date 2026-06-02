/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.wixstatic.com',
        pathname: '/media/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
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
