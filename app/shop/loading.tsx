import { BrandLoader } from '@/components/BrandLoader'

// Segment-level loading UI for the client shop. The layout (header/footer/nav)
// stays mounted; this fills the content area with the PEPTSCI heartbeat loader
// while the page streams in.
export default function ShopLoading() {
  return <BrandLoader className="min-h-[70vh]" />
}
