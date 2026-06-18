// Segment-level loading UI for all (dashboard) routes. The persistent layout
// (header/footer) stays mounted; this fills the content area while the server
// component streams in, so navigations never show a blank screen.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-md bg-white/10" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-white/10 bg-white/5" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-80 rounded-xl border border-white/10 bg-white/5 lg:col-span-2" />
        <div className="h-80 rounded-xl border border-white/10 bg-white/5" />
      </div>

      <div className="h-64 rounded-xl border border-white/10 bg-white/5" />
    </div>
  )
}
