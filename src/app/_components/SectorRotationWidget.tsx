'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'

type SectorData = {
  sector: string
  stock_count: number
  avg_change_pct: number
  total_net_foreign: number
  momentum: string
}

const WINDOW_OPTIONS = [
  { label: '1D',  value: 1 },
  { label: '7D',  value: 7 },
  { label: '20D', value: 20 },
  { label: '30D', value: 30 },
  { label: '60D', value: 60 },
]

export default function SectorRotationWidget() {
  const [window, setWindow] = useState(1) // default 1D
  const [sectors, setSectors] = useState<SectorData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSectors = useCallback(async (w: number) => {
    setLoading(true)
    try {
      const { data: dateData } = await supabase
        .from('daily_transactions')
        .select('trading_date')
        .order('trading_date', { ascending: false })
        .limit(1)

      const date = dateData?.[0]?.trading_date
      if (!date) return

      const { data } = await supabase.rpc('get_sector_rotation', {
        p_date: date,
        p_window: w,
      })
      setSectors(data || [])
    } catch (err) {
      console.error('Failed to fetch sector rotation:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSectors(window)
  }, [window, fetchSectors])

  return (
    <div className="glass rounded-2xl p-5 border border-white/[0.06]">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Sector Rotation</h2>
          <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">
            · {window}D momentum
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle buttons */}
          <div className="flex bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWindow(opt.value)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                  window === opt.value
                    ? 'bg-gold-400/20 text-gold-400 shadow-sm'
                    : 'text-muted-foreground hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Link href="/sector" className="text-[9px] font-black text-gold-400 hover:text-white transition-colors uppercase tracking-widest">
            Full Map →
          </Link>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl p-4 bg-white/[0.02] border border-white/5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {sectors.map((sec, i) => {
            const priceUp = Number(sec.avg_change_pct) > 0
            const priceDown = Number(sec.avg_change_pct) < 0
            const isInflow = sec.momentum?.includes('INFLOW')
            const isOutflow = sec.momentum?.includes('OUTFLOW')
            const isStrong = sec.momentum?.includes('STRONG')

            return (
              <Link
                key={i}
                href={`/sector?name=${encodeURIComponent(sec.sector)}`}
                className={`relative rounded-xl p-4 border transition-all duration-300 group cursor-pointer
                  ${isStrong
                    ? (isInflow ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10'
                      : 'bg-red-500/5 border-red-500/30 hover:bg-red-500/10')
                    : isInflow ? 'bg-emerald-500/[0.02] border-emerald-500/15 hover:bg-emerald-500/5'
                    : isOutflow ? 'bg-red-500/[0.02] border-red-500/15 hover:bg-red-500/5'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                  }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[10px] font-black text-foreground/80 truncate max-w-[80%] uppercase tracking-wider">
                    {sec.sector}
                  </p>
                  {isStrong && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400 shadow-[0_0_6px_rgba(231,183,51,0.6)] animate-pulse" />
                  )}
                </div>

                {/* 🔧 PERBAIKAN: warna mengikuti arah harga, bukan arah flow */}
                <p className={`text-xl font-black ${
                  priceUp ? 'text-emerald-400' : priceDown ? 'text-red-400' : 'text-muted-foreground'
                }`}>
                  {priceUp ? '+' : ''}{Number(sec.avg_change_pct).toFixed(2)}%
                </p>

                <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between">
                  <span className="text-[9px] font-bold text-muted-foreground/60">
                    {sec.stock_count} stk
                  </span>
                  <span className={`text-[9px] font-black ${
                    isInflow ? 'text-emerald-400' : isOutflow ? 'text-red-400' : 'text-muted-foreground'
                  }`}>
                    {formatRupiah(sec.total_net_foreign)}
                  </span>
                </div>

                {/* Momentum label — tetap berdasarkan flow */}
                <div className={`mt-2 px-2 py-0.5 rounded-full text-[8px] font-black text-center uppercase tracking-wider
                  ${isStrong && isInflow ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : isInflow ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : isOutflow ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-white/5 text-muted-foreground border border-white/5'
                  }`}>
                  {sec.momentum?.replace(/_/g, ' ') || 'NEUTRAL'}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
