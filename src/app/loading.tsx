export default function Loading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title skeleton */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="space-y-2">
          <div className="shimmer h-9 w-64 rounded-xl" />
          <div className="shimmer h-4 w-40 rounded-lg" />
        </div>
        <div className="flex gap-3">
          <div className="shimmer h-10 w-32 rounded-xl" />
          <div className="shimmer h-10 w-24 rounded-xl" />
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-5 border border-border/30">
            <div className="shimmer h-4 w-4 rounded mb-3" />
            <div className="shimmer h-3 w-20 rounded mb-2" />
            <div className="shimmer h-8 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="glass rounded-2xl border border-border/30 overflow-hidden">
        <div className="p-4 border-b border-white/[0.05]">
          <div className="shimmer h-5 w-40 rounded" />
        </div>
        <div className="divide-y divide-white/[0.03]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4"
              style={{ opacity: 1 - i * 0.09 }}>
              <div className="shimmer h-4 w-4 rounded flex-shrink-0" />
              <div className="shimmer h-5 w-16 rounded font-mono" />
              <div className="shimmer h-4 w-24 rounded flex-1" />
              <div className="shimmer h-4 w-16 rounded ml-auto" />
              <div className="shimmer h-4 w-14 rounded" />
              <div className="shimmer h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
