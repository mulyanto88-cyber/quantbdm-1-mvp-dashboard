'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { formatRupiah } from '@/lib/utils'

type SectorData = {
  sector: string
  stock_count: number
  avg_change_pct: number
  total_net_foreign: number
  momentum: string
}

const WINDOW_OPTIONS = [
  { label: '1D', value: 1 }, { label: '7D', value: 7 }, { label: '20D', value: 20 },
  { label: '30D', value: 30 }, { label: '60D', value: 60 },
]

async function fetchSectorRotation(window: number): Promise<SectorData[]> {
  const res = await fetch('/api/motherduck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `SELECT * FROM market.vw_sector_analytics ORDER BY momentum_score DESC`,
    }),
  })
  const json = await res.json()
  return (json.data || []).map((d: any) => ({
    sector: d.sector,
    stock_count: Number(d.stock_count),
    avg_change_pct: Number(d.avg_change_pct),
    total_net_foreign: Number(d.foreign_flow),
    momentum: d.signal || 'NEUTRAL',
  }))
}

export default function SectorRotationWidget() {
  const [window, setWindow] = useState(1)
  const [sectors, setSectors] = useState<SectorData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSectors = useCallback(async (w: number) => {
    setLoading(true)
    try {
      const data = await fetchSectorRotation(w)
      setSectors(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSectors(window) }, [window, fetchSectors])

  return (
    <div className="glass rounded-2xl p-5 border border-white/[0.06]">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Sector Rotation</h2>
          <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">· {window}D momentum</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            {WINDOW_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setWindow(opt.value)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${window === opt.value ? 'bg-gold-400/20 text-gold-400 shadow-sm' : 'text-muted-foreground hover:text-white hover:bg-white/[0.04]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <Link href="/sector" className="text-[9px] font-black text-gold-400 hover:text-white transition-colors uppercase tracking-widest">Full Map →</Link>
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="rounded-xl p-4 bg-white/[0.02] border border-white/5 animate-pulse h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {sectors.map((sec, i) => {
            const priceUp = Number(sec.avg_change_pct) > 0
            const priceDown = Number(sec.avg_change_pct) < 0
            const isInflow = sec.momentum?.includes('BULLISH')
            const isOutflow = sec.momentum?.includes('BEARISH')

            return (
              <Link key={i} href={`/sector?name=${encodeURIComponent(sec.sector)}`}
                className={`relative rounded-xl p-4 border transition-all duration-300 group cursor-pointer ${
                  isInflow ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10'
                  : isOutflow ? 'bg-red-500/5 border-red-500/30 hover:bg-red-500/10'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                }`}>
                <p className="text-[10px] font-black text-foreground/80 truncate uppercase tracking-wider">{sec.sector}</p>
                <p className={`text-xl font-black ${priceUp ? 'text-emerald-400' : priceDown ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {priceUp ? '+' : ''}{Number(sec.avg_change_pct).toFixed(2)}%
                </p>
                <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between">
                  <span className="text-[9px] font-bold text-muted-foreground/60">{sec.stock_count} stk</span>
                  <span className={`text-[9px] font-black ${isInflow ? 'text-emerald-400' : isOutflow ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {formatRupiah(sec.total_net_foreign)}
                  </span>
                </div>
                <div className={`mt-2 px-2 py-0.5 rounded-full text-[8px] font-black text-center uppercase tracking-wider ${
                  isInflow ? 'bg-emerald-500/20 text-emerald-300' : isOutflow ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-muted-foreground'
                }`}>{sec.momentum?.replace(/_/g, ' ') || 'NEUTRAL'}</div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
