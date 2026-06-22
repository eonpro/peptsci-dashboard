// Segment-level loading UI for white-label storefronts. Uses currentColor at
// low opacity so the skeleton reads correctly on any tenant's brand background.
export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-8 px-4 py-8" aria-busy="true" aria-label="Loading">
      <div className="h-48 rounded-2xl bg-current opacity-10" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl p-4 opacity-10">
            <div className="h-40 rounded-xl bg-current" />
            <div className="h-4 w-3/4 rounded bg-current" />
            <div className="h-4 w-1/2 rounded bg-current" />
          </div>
        ))}
      </div>
    </div>
  )
}
