'use client'

/**
 * ChartWrapper — ensures recharts only renders on the client.
 * Wrap any recharts component inside this to prevent SSR errors.
 * Usage:
 *   import ChartWrapper from '@/components/chart-wrapper'
 *   <ChartWrapper height={220}>
 *     <ResponsiveContainer ...>...</ResponsiveContainer>
 *   </ChartWrapper>
 */

import { useEffect, useState } from 'react'

export default function ChartWrapper({
  children,
  height = 220,
  className = '',
}: {
  children: React.ReactNode
  height?: number
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return (
      <div
        className={`shimmer rounded-xl ${className}`}
        style={{ height }}
      />
    )
  }

  return (
    <div style={{ height }} className={className}>
      {children}
    </div>
  )
}
