'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatRupiah, formatNumber } from '@/lib/utils'
import { Activity, Building2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, X } from 'lucide-react'
import Link from 'next/link'

// ─── API Helper ──────────────────────────────────────────────────────────────
async function mdQuery(query: string, params?: any[]): Promise<any[]> {
  const res = await fetch('/api/motherduck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data || []
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface SectorData {
  sector: string
  stock_count: number
  total_foreign_flow: number
  avg_change_pct: number
  total_value: number
  whale_count: number
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SectorPage() {
  const [sectors, setSectors] = useState<SectorData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [sectorStocks, setSectorStocks] = useState<any[]>([])
  const [stocksLoading, setStocksLoading] = useState(false)

  // ─── Fetch Sectors ──────────────────────────────────────────────────────────
  const fetchSectors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await mdQuery(`
        SELECT 
          sector,
          stock_count,
          total_foreign_flow,
          avg_change_pct,
          total_value,
          whale_count
        FROM market.vw_sector_foreign
        ORDER BY total_foreign_flow DESC
      `)
      setSectors(data.map((d: any) => ({
        sector: d.sector,
        stock_count: Number(d.stock_count || 0),
        total_foreign_flow: Number(d.total_foreign_flow || 0),
        avg_change_pct: Number(d.avg_change_pct || 0),
        total_value: Number(d.total_value || 0),
        whale_count: Number(d.whale_count || 0),
      })))
    } catch (err: any) {
      setError(err.message || 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSectors() }, [fetchSectors])

  // ─── Fetch Stocks in Sector ─────────────────────────────────────────────────
  const fetchSectorStocks = useCallback(async (sector: string) => {
    setStocksLoading(true)
    try {
      const data = await mdQuery(`
        SELECT 
          stock_code,
          close,
          change_percent,
          net_foreign_value,
          value,
          whale_signal,
          big_player_anomaly
        FROM market.vw_stock_latest
        WHERE sector = $1
        ORDER BY value DESC
        LIMIT 50
      `, [sector])
      setSectorStocks(data)
    } catch (err: any) {
      console.error(err)
    } finally {
      setStocksLoading(false)
    }
  }, [])

  const handleSectorClick = (sector: string) => {
    if (selectedSector === sector) {
      setSelectedSector(null)
      setSectorStocks([])
    } else {
      setSelectedSector(sector)
      fetchSectorStocks(sector)
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────
  const maxForeign = Math.max(...sectors.map(s => Math.abs(s.total_foreign_flow)), 1)
  const totalStocks = sectors.reduce((s, sec) => s + sec.stock_count, 0)
  const totalFlow = sectors.reduce((s, sec) => s + sec.total_foreign_flow, 0)

  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Building2 className="w-8 h-8 text-purple-400 inline mr-2" />
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Sector Rotation</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {sectors.length} sectors · {totalStocks} stocks · Net Foreign: {formatRupiah(totalFlow)}
          </p>
        </div>
        <button onClick={fetchSectors} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-400/10 border border-purple-400/30 text-purple-400 text-sm font-bold hover:bg-purple-400/20 transition-all">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shimmer h-36 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Sector Cards */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sectors.map((sec) => {
            const isInflow = sec.total_foreign_flow > 0
            const isOutflow = sec.total_foreign_flow < 0
            const barWidth = (Math.abs(sec.total_foreign_flow) / maxForeign) * 100

            return (
              <div key={sec.sector}>
                <div
                  onClick={() => handleSectorClick(sec.sector)}
                  className={`glass rounded-2xl p-5 border cursor-pointer transition-all duration-300 card-hover ${
                    selectedSector === sec.sector
                      ? 'ring-2 ring-purple-400/50 border-purple-400/30 bg-purple-400/[0.03]'
                      : isInflow
                        ? 'border-emerald-500/15 hover:border-emerald-500/30'
                        : isOutflow
                          ? 'border-red-500/15 hover:border-red-500/30'
                          : 'border-border/30 hover:border-white/[0.08]'
                  }`}
                >
                  {/* Sector Name */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-black uppercase tracking-wider truncate max-w-[70%]">{sec.sector}</h3>
                    {Math.abs(sec.total_foreign_flow) > 5e9 && (
                      <span className={`w-2 h-2 rounded-full animate-pulse ${
                        isInflow ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                      }`} />
                    )}
                  </div>

                  {/* Avg Change */}
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className={`text-2xl font-black ${sec.avg_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {sec.avg_change_pct >= 0 ? '+' : ''}{sec.avg_change_pct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase">avg</span>
                  </div>

                  {/* Foreign Flow Bar */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-[9px] text-muted-foreground uppercase">
                      <span>Foreign Flow</span>
                      <span className={`font-bold ${isInflow ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(sec.total_foreign_flow)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isInflow ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer Stats */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="font-bold">{sec.stock_count} stocks</span>
                      <span>{formatRupiah(sec.total_value)}</span>
                    </div>
                    {sec.whale_count > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-bold">
                        🐋 {sec.whale_count}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sector Stocks Drill-down */}
                {selectedSector === sec.sector && (
                  <div className="mt-2 glass rounded-2xl border border-purple-400/20 overflow-hidden animate-fade-in">
                    <div className="p-3 border-b border-white/[0.05] bg-purple-400/[0.02]">
                      <p className="text-xs font-black text-purple-400 uppercase tracking-wider">
                        {sec.sector} — Top Stocks
                      </p>
                    </div>
                    {stocksLoading ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="shimmer h-10 rounded-lg" />
                        ))}
                      </div>
                    ) : sectorStocks.length > 0 ? (
                      <div className="divide-y divide-white/[0.03] max-h-[300px] overflow-y-auto">
                        {sectorStocks.map((stock) => (
                          <Link
                            key={stock.stock_code}
                            href={`/stock/${stock.stock_code}`}
                            className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors group"
                          >
                            <div>
                              <p className="font-mono font-black text-xs group-hover:text-purple-400 transition-colors">{stock.stock_code}</p>
                              <p className="text-[9px] text-muted-foreground">{formatRupiah(Number(stock.close))}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-xs font-bold ${Number(stock.change_percent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {Number(stock.change_percent) >= 0 ? '+' : ''}{Number(stock.change_percent).toFixed(2)}%
                              </p>
                              <p className={`text-[9px] ${Number(stock.net_foreign_value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatRupiah(Number(stock.net_foreign_value))}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {stock.whale_signal && <span className="text-[10px]">🐋</span>}
                              {stock.big_player_anomaly && <span className="text-[10px]">⚡</span>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="p-4 text-center text-muted-foreground text-xs">No stocks found</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
