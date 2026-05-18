'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatRupiah, formatNumber } from '@/lib/utils'
import { 
  Activity, Building2, RefreshCw, TrendingUp, TrendingDown, 
  AlertTriangle, X, Zap, BarChart3, Globe, Target, ArrowUp, ArrowDown
} from 'lucide-react'
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
  avg_change_pct: number
  total_value: number
  total_volume: number
  foreign_flow: number
  foreign_30d: number
  avg_aov: number
  max_aov: number
  aov_spike_count: number
  whale_count: number
  anomaly_count: number
  above_vwma_count: number
  volume_spike_count: number
  gainers: number
  losers: number
  momentum_score: number
  signal: string
  flow_intensity: string
  top_stock_code: string
  top_stock_price: number
  top_stock_change: number
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SectorPage() {
  const [sectors, setSectors] = useState<SectorData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [sectorStocks, setSectorStocks] = useState<any[]>([])
  const [stocksLoading, setStocksLoading] = useState(false)

  // ⭐ NEW: Sector KPI state
  const [sectorKPI, setSectorKPI] = useState<any>(null)

  const fetchSectors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await mdQuery(`SELECT * FROM market.vw_sector_analytics ORDER BY momentum_score DESC`)
      setSectors(data.map((d: any) => ({
        sector: d.sector,
        stock_count: Number(d.stock_count || 0),
        avg_change_pct: Number(d.avg_change_pct || 0),
        total_value: Number(d.total_value || 0),
        total_volume: Number(d.total_volume || 0),
        foreign_flow: Number(d.foreign_flow || 0),
        foreign_30d: Number(d.foreign_30d || 0),
        avg_aov: Number(d.avg_aov || 0),
        max_aov: Number(d.max_aov || 0),
        aov_spike_count: Number(d.aov_spike_count || 0),
        whale_count: Number(d.whale_count || 0),
        anomaly_count: Number(d.anomaly_count || 0),
        above_vwma_count: Number(d.above_vwma_count || 0),
        volume_spike_count: Number(d.volume_spike_count || 0),
        gainers: Number(d.gainers || 0),
        losers: Number(d.losers || 0),
        momentum_score: Number(d.momentum_score || 0),
        signal: d.signal || 'NEUTRAL',
        flow_intensity: d.flow_intensity || 'LOW',
        top_stock_code: d.top_stock_code || '',
        top_stock_price: Number(d.top_stock_price || 0),
        top_stock_change: Number(d.top_stock_change || 0),
      })))
    } catch (err: any) {
      setError(err.message || 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  // ⭐ NEW: Fetch Sector KPI
  const fetchSectorKPI = useCallback(async () => {
    try {
      const data = await mdQuery(`
        SELECT 
          SUM(CASE WHEN foreign_flow > 0 THEN foreign_flow ELSE 0 END) AS total_inflow,
          SUM(CASE WHEN foreign_flow < 0 THEN ABS(foreign_flow) ELSE 0 END) AS total_outflow,
          COUNT(CASE WHEN signal LIKE '%BULLISH%' THEN 1 END) AS strong_inflow_count,
          COUNT(CASE WHEN signal LIKE '%BEARISH%' THEN 1 END) AS strong_outflow_count,
          COUNT(*) AS total_sectors
        FROM market.vw_sector_analytics
      `)
      if (data.length > 0) setSectorKPI(data[0])
    } catch (err: any) {
      console.error('KPI fetch error:', err)
    }
  }, [])

  useEffect(() => { 
    fetchSectors()
    fetchSectorKPI()
  }, [fetchSectors, fetchSectorKPI])

  const fetchSectorStocks = useCallback(async (sector: string) => {
    setStocksLoading(true)
    try {
      const data = await mdQuery(`
        SELECT 
          stock_code, close, change_percent, net_foreign_value, value,
          whale_signal, big_player_anomaly, aov_ratio_ma20, volume, ma20_volume
        FROM market.vw_stock_latest
        WHERE sector = $1
        ORDER BY value DESC LIMIT 50
      `, [sector])
      setSectorStocks(data)
    } catch (err: any) {
      console.error(err)
    } finally {
      setStocksLoading(false)
    }
  }, [])

  // ─── Stats ──────────────────────────────────────────────────────────────────
  const totalStocks = sectors.reduce((s, sec) => s + sec.stock_count, 0)
  const totalFlow = sectors.reduce((s, sec) => s + sec.foreign_flow, 0)
  const totalValue = sectors.reduce((s, sec) => s + sec.total_value, 0)

  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Building2 className="w-8 h-8 text-purple-400 inline mr-2" />
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Sector Analytics</span>
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

      {/* ════════════════════════════════════════════════════════════
          ⭐ KPI CARDS — TOP ROW
          ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Value', value: formatRupiah(totalValue), color: 'text-gold-400', icon: BarChart3 },
          { label: 'Net Foreign', value: formatRupiah(totalFlow), color: totalFlow >= 0 ? 'text-emerald-400' : 'text-red-400', icon: Globe },
          { label: 'Total Stocks', value: totalStocks.toString(), color: 'text-blue-400', icon: Target },
          { label: 'Sectors', value: sectors.length.toString(), color: 'text-purple-400', icon: Building2 },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <div key={i} className="glass rounded-2xl p-4 border border-border/30 card-hover">
              <Icon className={`w-4 h-4 ${m.color} mb-2`} />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
              <p className={`text-xl font-black mt-1 ${m.color}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════
          ⭐ KPI CARDS — FOREIGN FLOW SUMMARY
          ════════════════════════════════════════════════════════════ */}
      {sectorKPI && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Inflow', value: formatRupiah(Number(sectorKPI.total_inflow)), color: 'text-emerald-400', icon: TrendingUp },
            { label: 'Total Outflow', value: formatRupiah(Number(sectorKPI.total_outflow)), color: 'text-red-400', icon: TrendingDown },
            { label: 'Strong Inflow', value: `${sectorKPI.strong_inflow_count}/${sectorKPI.total_sectors} sectors`, color: 'text-emerald-400', icon: ArrowUp },
            { label: 'Strong Outflow', value: `${sectorKPI.strong_outflow_count}/${sectorKPI.total_sectors} sectors`, color: 'text-red-400', icon: ArrowDown },
          ].map((m, i) => {
            const Icon = m.icon
            return (
              <div key={i} className="glass rounded-xl p-4 border border-border/30 card-hover">
                <Icon className={`w-4 h-4 ${m.color} mb-2`} />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                <p className={`text-lg font-black mt-1 ${m.color}`}>{m.value}</p>
              </div>
            )
          })}
        </div>
      )}

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-48 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Sector Cards */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sectors.map((sec) => {
            const barWidth = Math.min((Math.abs(sec.foreign_flow) / Math.max(...sectors.map(s => Math.abs(s.foreign_flow)), 1)) * 100, 100)
            const vwmaPct = sec.stock_count > 0 ? (sec.above_vwma_count / sec.stock_count * 100) : 0
            const breadthPct = sec.stock_count > 0 ? (sec.gainers / sec.stock_count * 100) : 0

            return (
              <div key={sec.sector}>
                <div
                  onClick={() => {
                    if (selectedSector === sec.sector) { setSelectedSector(null); setSectorStocks([]) }
                    else { setSelectedSector(sec.sector); fetchSectorStocks(sec.sector) }
                  }}
                  className={`glass rounded-2xl p-5 border cursor-pointer transition-all duration-300 ${
                    selectedSector === sec.sector
                      ? 'ring-2 ring-purple-400/50 border-purple-400/30'
                      : 'border-border/30 hover:border-white/[0.08] card-hover'
                  }`}
                >
                  {/* Top Row: Sector Name + Signal */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black uppercase tracking-wider truncate max-w-[60%]">{sec.sector}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      sec.signal.includes('BULLISH') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      sec.signal.includes('BEARISH') ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                    }`}>{sec.signal}</span>
                  </div>

                  {/* KPI Grid */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                      <p className="text-[8px] text-muted-foreground uppercase">Momentum</p>
                      <p className={`text-lg font-black ${sec.momentum_score >= 50 ? 'text-emerald-400' : sec.momentum_score >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                        {sec.momentum_score}
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                      <p className="text-[8px] text-muted-foreground uppercase">Avg Chg</p>
                      <p className={`text-lg font-black ${sec.avg_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {sec.avg_change_pct >= 0 ? '+' : ''}{sec.avg_change_pct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                      <p className="text-[8px] text-muted-foreground uppercase">Foreign</p>
                      <p className={`text-lg font-black ${sec.foreign_flow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(sec.foreign_flow)}
                      </p>
                    </div>
                  </div>

                  {/* Foreign Flow Bar */}
                  <div className="space-y-1 mb-3">
                    <div className="flex justify-between text-[9px] text-muted-foreground uppercase">
                      <span>Flow Intensity: {sec.flow_intensity}</span>
                      <span className="font-bold">{sec.stock_count} stocks</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div className={`h-full rounded-full ${sec.foreign_flow >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>

                  {/* Bottom Stats */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/[0.04] text-center">
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">VWMA</p>
                      <p className={`text-xs font-bold ${vwmaPct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{vwmaPct.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">Breadth</p>
                      <p className={`text-xs font-bold ${breadthPct >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{breadthPct.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">AOV Spike</p>
                      <p className={`text-xs font-bold ${sec.aov_spike_count > 0 ? 'text-purple-400' : 'text-muted-foreground'}`}>{sec.aov_spike_count}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase">Whale</p>
                      <p className={`text-xs font-bold ${sec.whale_count > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>{sec.whale_count}</p>
                    </div>
                  </div>

                  {/* Top Stock */}
                  {sec.top_stock_code && (
                    <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground">Top: </span>
                      <Link href={`/stock/${sec.top_stock_code}`} className="font-mono font-black text-xs text-purple-400 hover:text-purple-300">
                        {sec.top_stock_code}
                      </Link>
                      <span className="text-xs text-muted-foreground">{formatRupiah(sec.top_stock_price)}</span>
                      <span className={`text-[10px] font-bold ${sec.top_stock_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {sec.top_stock_change >= 0 ? '+' : ''}{sec.top_stock_change.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Drill-down Stocks */}
                {selectedSector === sec.sector && (
                  <div className="mt-2 glass rounded-2xl border border-purple-400/20 overflow-hidden animate-fade-in">
                    <div className="p-3 border-b border-white/[0.05] bg-purple-400/[0.02] flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-purple-400" />
                      <p className="text-xs font-black text-purple-400 uppercase tracking-wider">{sec.sector} — Stocks</p>
                    </div>
                    {stocksLoading ? (
                      <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-10 rounded-lg" />)}</div>
                    ) : sectorStocks.length > 0 ? (
                      <div className="divide-y divide-white/[0.03] max-h-[300px] overflow-y-auto">
                        {sectorStocks.map((stock) => (
                          <Link key={stock.stock_code} href={`/stock/${stock.stock_code}`}
                            className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors group">
                            <div className="flex-1 min-w-0">
                              <p className="font-mono font-black text-xs group-hover:text-purple-400 transition-colors">{stock.stock_code}</p>
                              <p className="text-[9px] text-muted-foreground">{formatRupiah(Number(stock.close))}</p>
                            </div>
                            <div className="text-right mx-3">
                              <p className={`text-xs font-bold ${Number(stock.change_percent) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {Number(stock.change_percent) >= 0 ? '+' : ''}{Number(stock.change_percent).toFixed(2)}%
                              </p>
                              <p className={`text-[9px] ${Number(stock.net_foreign_value) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatRupiah(Number(stock.net_foreign_value))}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                              {Number(stock.aov_ratio_ma20) >= 1.5 && <span className="text-purple-400 font-bold">{Number(stock.aov_ratio_ma20).toFixed(1)}x</span>}
                              {Number(stock.volume) > Number(stock.ma20_volume) * 1.5 && <Zap className="w-3 h-3 text-amber-400" />}
                              {stock.whale_signal && <span>🐋</span>}
                              {stock.big_player_anomaly && <span>⚡</span>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : <p className="p-4 text-center text-muted-foreground text-xs">No stocks found</p>}
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
