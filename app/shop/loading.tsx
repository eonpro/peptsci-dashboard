// Segment-level loading UI for the client shop. The layout (header/footer/nav)
// stays mounted; this fills the content area with a catalog-shaped skeleton.
export default function ShopLoading() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-label="Loading">
      <div className="h-40 rounded-2xl border border-white/10 bg-white/5" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="h-40 rounded-xl bg-white/10" />
            <div className="h-4 w-3/4 rounded bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/10" />
            <div className="h-9 rounded-lg bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  )
}
