'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Activity, Building2 } from 'lucide-react'
import { formatRupiah, formatNumber } from '@/lib/utils'

interface SectorHeatmapProps {
  sectorHeatmap: any[]
  allStocks: any[]
}

export default function SectorHeatmap({ sectorHeatmap, allStocks }: SectorHeatmapProps) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null)

  if (!sectorHeatmap || sectorHeatmap.length === 0) return null

  return (
    <div className="glass rounded-3xl p-6 border border-white/10 shadow-2xl relative overflow-hidden group/heatmap">
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -mr-20 -mt-20" />
      
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-black text-lg text-white tracking-tight">Sector Intelligence Map</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Institutional Flow Velocity</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400/60" /> Accumulation</div>
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400/60" /> Distribution</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 relative z-10">
        {sectorHeatmap.map((sec: any, i: number) => {
          const netF = sec.netForeign
          const avg  = sec.avgChange
          const upRatio = sec.count > 0 ? sec.up / sec.count : 0
          const isPos = avg >= 0
          const isWhaleActive = Math.abs(netF) > 5e9 // > 5B
          
          const isSelected = selectedSector === sec.sector
          return (
            <div
              key={i}
              onClick={() => setSelectedSector(isSelected ? null : sec.sector)}
              className={`relative rounded-2xl p-4 border transition-all duration-500 cursor-pointer group/sec ${
                isSelected 
                  ? 'ring-2 ring-gold-400/50 bg-white/[0.08] border-gold-400/30' 
                  : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate max-w-[80%]">{sec.sector}</p>
                {isWhaleActive && (
                  <div className="w-2 h-2 rounded-full bg-gold-400 shadow-[0_0_8px_rgba(231,183,51,0.6)] animate-pulse" title="Whale Activity Detected" />
                )}
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black tracking-tighter ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                  {avg > 0 ? '+' : ''}{avg.toFixed(2)}%
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex justify-between items-center text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                  <span>Breadth</span>
                  <span>{Math.round(upRatio * 100)}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${isPos ? 'bg-emerald-400' : 'bg-red-400'}`} 
                    style={{ width: `${upRatio * 100}%`, opacity: isSelected ? 1 : 0.4 }} 
                  />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground">{sec.count} STK</span>
                <span className={`text-[10px] font-black ${netF >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {netF >= 0 ? '▲' : '▼'} {formatRupiah(Math.abs(netF))}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Sector Drill-down (Premium Panel) ── */}
      {selectedSector && (() => {
        const stocks = (allStocks || [])
          .filter((s: any) => s.sector === selectedSector)
          .sort((a: any, b: any) => b.value - a.value)
        const sectorInfo = sectorHeatmap.find((s: any) => s.sector === selectedSector)
        const netF = sectorInfo?.netForeign || 0
        const avg  = sectorInfo?.avgChange  || 0
        const isPos = avg >= 0
        return (
          <div className="mt-6 rounded-3xl border border-gold-400/20 bg-gold-400/[0.02] overflow-hidden animate-in slide-in-from-top-4 duration-500 shadow-2xl relative z-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-4 bg-white/[0.02] border-b border-white/5 gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-gold-400" />
                </div>
                <div>
                  <h4 className="font-black text-xl text-white tracking-tight">{selectedSector} Intelligence</h4>
                  <div className="flex items-center gap-3 mt-0.5">
                     <span className={`text-xs font-black ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                       {isPos ? 'Bullish' : 'Bearish'} Momentum: {avg > 0 ? '+' : ''}{avg.toFixed(2)}%
                     </span>
                     <span className="w-1 h-1 rounded-full bg-white/20" />
                     <span className={`text-xs font-black ${netF >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                       Flow: {netF >= 0 ? 'Accumulation' : 'Distribution'} ({formatRupiah(netF)})
                     </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedSector(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-white transition-all"
              >Close Panel</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 p-2 gap-2">
              {stocks.map((s: any, i: number) => (
                <Link
                  key={i}
                  href={`/stock/${s.code}`}
                  className="flex flex-col p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all group/stock"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono font-black text-lg text-white group-hover/stock:text-gold-400 transition-colors leading-none">{s.code}</span>
                    <span className={`text-xs font-black ${s.change > 0 ? 'text-emerald-400' : s.change < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {s.change > 0 ? '+' : ''}{s.change.toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Price: {formatRupiah(s.close)}</p>
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                     <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Val: {formatNumber(s.value)}</span>
                     {s.netForeign !== 0 && (
                       <span className={`text-[9px] font-black ${s.netForeign > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                         {s.netForeign > 0 ? '▲' : '▼'} {formatNumber(Math.abs(s.netForeign))}
                       </span>
                     )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
