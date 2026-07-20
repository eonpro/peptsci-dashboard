import { BrandLoader } from '@/components/BrandLoader'

// Segment-level loading UI for all (dashboard) routes. The persistent layout
// (header/footer) stays mounted; this fills the content area with the PEPTSCI
// heartbeat loader while the server component streams in, so navigations
// never show a blank screen.
export default function DashboardLoading() {
  return <BrandLoader className="min-h-[70vh]" />
}
