import React from 'react'

export default function Loading() {
  return (
    <div className="space-y-10 pb-12 animate-fade-in w-full">
      {/* Skeleton Hero */}
      <div className="glass rounded-[2.5rem] p-8 md:p-10 border border-white/[0.08] shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-12 items-center">
          <div className="shimmer w-full lg:w-72 h-72 rounded-[2.5rem] shrink-0" />
          <div className="flex-1 space-y-6 w-full">
            <div className="shimmer w-32 h-6 rounded-full" />
            <div className="shimmer w-3/4 h-16 rounded-xl" />
            <div className="shimmer w-1/2 h-6 rounded-md" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              <div className="shimmer h-24 rounded-2xl" />
              <div className="shimmer h-24 rounded-2xl" />
              <div className="shimmer h-24 rounded-2xl" />
              <div className="shimmer h-24 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton Indicator */}
      <div className="flex justify-between items-center px-2">
        <div className="shimmer w-48 h-4 rounded-md" />
        <div className="shimmer w-64 h-10 rounded-xl" />
      </div>

      {/* Skeleton Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="shimmer h-28 rounded-xl" />
        <div className="shimmer h-28 rounded-xl" />
        <div className="shimmer h-28 rounded-xl" />
        <div className="shimmer h-28 rounded-xl" />
      </div>

      {/* Skeleton Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="shimmer h-80 rounded-xl" />
        <div className="shimmer h-80 rounded-xl" />
        <div className="shimmer h-80 rounded-xl" />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="shimmer h-80 rounded-xl" />
        <div className="shimmer h-80 rounded-xl" />
        <div className="shimmer h-80 rounded-xl" />
      </div>

      {/* Skeleton Heatmap */}
      <div className="shimmer h-96 rounded-3xl" />
    </div>
  )
}
