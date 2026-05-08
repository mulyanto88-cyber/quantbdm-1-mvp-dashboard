'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber, formatShares } from '@/lib/utils'
import {
  Search, Filter, RefreshCw, TrendingUp, TrendingDown, Zap,
  Building2, Globe, AlertTriangle, X, ChevronUp, ChevronDown,
  Target, Activity, Eye, BarChart3, Radar, SlidersHorizontal
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────
interface ScreenerResult {
  stock_code: string
  sector: string
  current_price: number
  price_chg_pct: number
  smart_money_score: number
  conviction_score: number
  is_stealth: boolean
  net_foreign_30d: number
  broker_net_change: number
  whale_signal: boolean
  big_player_anomaly: boolean
  signal: 'STRONG_BUY' | 'WATCH' | 'NEUTRAL' | 'AVOID'
}

interface Filters {
  signal: string
  minScore: number
  onlyStealth: boolean
  onlyWhale: boolean
  onlyForeignBuy: boolean
  sector: string
  sortBy: keyof ScreenerResult
  sortDir: 'asc' | 'desc'
}

const SIGNAL_CONFIG = {
  STRONG_BUY: { label: 'Strong Buy', className: 'signal-strong-buy', dot: 'bg-emerald-400' },
  WATCH:      { label: 'Watch',      className: 'signal-watch',      dot: 'bg-amber-400' },
  NEUTRAL:    { label: 'Neutral',    className: 'signal-neutral',    dot: 'bg-slate-400' },
  AVOID:      { label: 'Avoid',      className: 'signal-avoid',      dot: 'bg-red-400' },
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ScreenerPage() {
  const [results, setResults]     = useState<ScreenerResult[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const [filters, setFilters] = useState<Filters>({
    signal: 'ALL',
    minScore: 0,
    onlyStealth: false,
    onlyWhale: false,
    onlyForeignBuy: false,
    sector: 'ALL',
    sortBy: 'smart_money_score',
    sortDir: 'desc',
  })

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchScreener = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('scan_smart_money_universe', {
        p_min_score:        filters.minScore,
        p_signal_filter:    filters.signal === 'ALL' ? null : filters.signal,
        p_only_stealth:     filters.onlyStealth,
        p_only_whale:       filters.onlyWhale,
        p_only_foreign_buy: filters.onlyForeignBuy,
        p_limit:            200,
      })
      if (rpcErr) throw rpcErr
      setResults(data || [])
      setLastUpdated(new Date().toLocaleTimeString('id-ID'))
    } catch (e: any) {
      setError(e.message || 'Failed to fetch screener data')
    } finally {
      setLoading(false)
    }
  }, [filters.minScore, filters.signal, filters.onlyStealth, filters.onlyWhale, filters.onlyForeignBuy])

  useEffect(() => { fetchScreener() }, [fetchScreener])

  // ── Derived ────────────────────────────────────────────────────────────────
  const sectors = ['ALL', ...Array.from(new Set(results.map(r => r.sector).filter(Boolean))).sort()]

  const filtered = results
    .filter(r => {
      if (search && !r.stock_code.toUpperCase().includes(search.toUpperCase()) &&
          !r.sector?.toLowerCase().includes(search.toLowerCase())) return false
      if (filters.sector !== 'ALL' && r.sector !== filters.sector) return false
      return true
    })
    .sort((a, b) => {
      const av = Number(a[filters.sortBy]) || 0
      const bv = Number(b[filters.sortBy]) || 0
      return filters.sortDir === 'desc' ? bv - av : av - bv
    })

  const stats = {
    total:      results.length,
    strongBuy:  results.filter(r => r.signal === 'STRONG_BUY').length,
    watch:      results.filter(r => r.signal === 'WATCH').length,
    stealth:    results.filter(r => r.is_stealth).length,
    whale:      results.filter(r => r.whale_signal).length,
    avgScore:   results.length ? Math.round(results.reduce((s, r) => s + (r.smart_money_score || 0), 0) / results.length) : 0,
  }

  const toggleSort = (col: keyof ScreenerResult) => {
    setFilters(f => ({
      ...f,
      sortBy: col,
      sortDir: f.sortBy === col ? (f.sortDir === 'desc' ? 'asc' : 'desc') : 'desc',
    }))
  }

  const SortIcon = ({ col }: { col: keyof ScreenerResult }) => {
    if (filters.sortBy !== col) return <ChevronUp className="w-3 h-3 opacity-20" />
    return filters.sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-gold-400" />
      : <ChevronUp className="w-3 h-3 text-gold-400" />
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Radar className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Screener</span>{' '}
            <span className="text-foreground">Pro</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Scanner Smart Money berbasis AI — {results.length} emiten dianalisis
            {lastUpdated && <span className="ml-2 text-[11px] opacity-60">· Update {lastUpdated}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              showFilters ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'glass border-border/30 text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {(filters.onlyStealth || filters.onlyWhale || filters.onlyForeignBuy || filters.signal !== 'ALL' || filters.minScore > 0) && (
              <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={fetchScreener}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 hover:bg-gold-400/20 text-sm font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Scan
          </button>
        </div>
      </div>

      {/* ── Stats Row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Universe',   value: stats.total,      color: 'text-foreground',    icon: Activity   },
          { label: 'Strong Buy', value: stats.strongBuy,  color: 'text-emerald-400',   icon: TrendingUp },
          { label: 'Watch',      value: stats.watch,       color: 'text-amber-400',    icon: Eye        },
          { label: 'Stealth',    value: stats.stealth,    color: 'text-purple-400',    icon: Zap        },
          { label: 'Whale 🐋',  value: stats.whale,      color: 'text-blue-400',      icon: Target     },
          { label: 'Avg Score',  value: stats.avgScore,   color: 'text-gold-400',      icon: BarChart3  },
        ].map((m, i) => {
          const Icon = m.icon
          return (
            <div key={i} className="glass rounded-xl p-4 border border-border/30 card-hover">
              <Icon className={`w-4 h-4 ${m.color} mb-2`} />
              <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
              <p className={`text-2xl font-black mt-0.5 ${m.color}`}>{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* ── Filter Panel ────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="glass rounded-2xl p-5 border border-gold-400/20 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Filter className="w-4 h-4 text-gold-400" /> Filter Criteria
            </h3>
            <button
              onClick={() => setFilters(f => ({ ...f, signal: 'ALL', minScore: 0, onlyStealth: false, onlyWhale: false, onlyForeignBuy: false, sector: 'ALL' }))}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Signal Filter */}
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-1.5 block">Signal</label>
              <div className="flex flex-col gap-1.5">
                {['ALL', 'STRONG_BUY', 'WATCH', 'NEUTRAL', 'AVOID'].map(sig => (
                  <button
                    key={sig}
                    onClick={() => setFilters(f => ({ ...f, signal: sig }))}
                    className={`text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      filters.signal === sig
                        ? sig === 'STRONG_BUY' ? 'signal-strong-buy border-emerald-500/30'
                          : sig === 'WATCH' ? 'signal-watch border-amber-500/30'
                          : sig === 'AVOID' ? 'signal-avoid border-red-500/30'
                          : 'bg-gold-400/20 border-gold-400/30 text-gold-400'
                        : 'border-border/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {sig === 'ALL' ? '📋 All Signals' : sig === 'STRONG_BUY' ? '🟢 Strong Buy' : sig === 'WATCH' ? '🟡 Watch' : sig === 'NEUTRAL' ? '⚪ Neutral' : '🔴 Avoid'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sector Filter */}
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-1.5 block">Sektor</label>
              <select
                value={filters.sector}
                onChange={e => setFilters(f => ({ ...f, sector: e.target.value }))}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs"
              >
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Score Filter */}
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-1.5 block">
                Min Smart Money Score: <span className="text-gold-400 font-bold">{filters.minScore}</span>
              </label>
              <input
                type="range" min={0} max={90} step={5}
                value={filters.minScore}
                onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value) }))}
                className="w-full accent-amber-400"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0</span><span>45</span><span>90</span>
              </div>
            </div>

            {/* Toggle Flags */}
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground uppercase mb-1.5 block">Special Flags</label>
              {[
                { key: 'onlyStealth', label: '🕵️ Stealth Accumulation', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
                { key: 'onlyWhale',   label: '🐋 Whale Signal',          color: 'border-blue-500/30 bg-blue-500/10 text-blue-400'   },
                { key: 'onlyForeignBuy', label: '🌏 Foreign Net Buy',    color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'   },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setFilters(f => ({ ...f, [key]: !f[key as keyof Filters] }))}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    filters[key as keyof Filters] ? color : 'border-border/30 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          placeholder="Filter kode saham atau sektor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
        {search && <button onClick={() => setSearch('')}><X className="w-4 h-4 text-muted-foreground hover:text-foreground" /></button>}
        <span className="text-xs text-muted-foreground flex-shrink-0">{filtered.length} hasil</span>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Results Table ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="glass rounded-2xl p-8 border border-border/30">
          <div className="flex items-center justify-center gap-3 py-12">
            <Radar className="w-8 h-8 text-gold-400 animate-spin" />
            <div>
              <p className="text-gold-400 font-bold">Scanning Smart Money Universe...</p>
              <p className="text-xs text-muted-foreground mt-1">Menganalisis {'>'}800 emiten IDX</p>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer h-12 rounded-xl" style={{ opacity: 1 - i * 0.1 }} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl p-16 text-center text-muted-foreground">
          <Radar className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="font-bold">Tidak ada saham yang memenuhi kriteria</p>
          <p className="text-xs mt-1">Coba longgarkan filter atau reset ke default</p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                  <th className="p-4 text-left sticky left-0 bg-[#0a0d1a]/90">#</th>
                  <th className="p-4 text-left sticky left-8 bg-[#0a0d1a]/90">
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('stock_code')}>
                      Emiten <SortIcon col="stock_code" />
                    </button>
                  </th>
                  <th className="p-4 text-right">
                    <button className="flex items-center gap-1 hover:text-foreground ml-auto" onClick={() => toggleSort('current_price')}>
                      Harga <SortIcon col="current_price" />
                    </button>
                  </th>
                  <th className="p-4 text-right">
                    <button className="flex items-center gap-1 hover:text-foreground ml-auto" onClick={() => toggleSort('price_chg_pct')}>
                      Chg% <SortIcon col="price_chg_pct" />
                    </button>
                  </th>
                  <th className="p-4 text-center">
                    <button className="flex items-center gap-1 hover:text-foreground mx-auto" onClick={() => toggleSort('smart_money_score')}>
                      SM Score <SortIcon col="smart_money_score" />
                    </button>
                  </th>
                  <th className="p-4 text-center hidden md:table-cell">
                    <button className="flex items-center gap-1 hover:text-foreground mx-auto" onClick={() => toggleSort('conviction_score')}>
                      Conviction <SortIcon col="conviction_score" />
                    </button>
                  </th>
                  <th className="p-4 text-right hidden lg:table-cell">
                    <button className="flex items-center gap-1 hover:text-foreground ml-auto" onClick={() => toggleSort('net_foreign_30d')}>
                      Foreign 30D <SortIcon col="net_foreign_30d" />
                    </button>
                  </th>
                  <th className="p-4 text-center">Flags</th>
                  <th className="p-4 text-center">Signal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const sig = SIGNAL_CONFIG[r.signal] || SIGNAL_CONFIG.NEUTRAL
                  const scoreColor =
                    r.smart_money_score >= 70 ? 'text-emerald-400' :
                    r.smart_money_score >= 50 ? 'text-amber-400' : 'text-muted-foreground'
                  return (
                    <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02] group">
                      <td className="p-4 text-[11px] text-muted-foreground sticky left-0 bg-background/90 group-hover:bg-white/[0.02]">{i + 1}</td>
                      <td className="p-4 sticky left-8 bg-background/90 group-hover:bg-white/[0.02]">
                        <Link href={`/stock/${r.stock_code}`} className="block">
                          <p className="font-black text-foreground hover:text-gold-400 transition-colors font-mono text-base">{r.stock_code}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">{r.sector || '—'}</p>
                        </Link>
                      </td>
                      <td className="p-4 text-right font-semibold">{formatNumber(r.current_price)}</td>
                      <td className={`p-4 text-right font-bold ${r.price_chg_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span className="flex items-center justify-end gap-0.5">
                          {r.price_chg_pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {formatPercent(r.price_chg_pct)}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-xl font-black ${scoreColor}`}>{Math.round(r.smart_money_score)}</span>
                          <div className="w-14 h-1 rounded-full bg-white/[0.05] mt-1 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              r.smart_money_score >= 70 ? 'bg-emerald-400' :
                              r.smart_money_score >= 50 ? 'bg-amber-400' : 'bg-slate-500'
                            }`} style={{ width: `${Math.min(100, r.smart_money_score)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center hidden md:table-cell">
                        <span className="text-sm font-bold text-blue-400">{Math.round(r.conviction_score || 0)}</span>
                      </td>
                      <td className={`p-4 text-right hidden lg:table-cell font-semibold ${r.net_foreign_30d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(r.net_foreign_30d)}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {r.is_stealth    && <span title="Stealth Accumulation" className="text-xs">🕵️</span>}
                          {r.whale_signal  && <span title="Whale Signal"         className="text-xs">🐋</span>}
                          {r.big_player_anomaly && <span title="Big Player Anomaly" className="text-xs">⚡</span>}
                          {r.net_foreign_30d > 0 && <span title="Foreign Net Buy" className="text-xs">🌏</span>}
                          {!r.is_stealth && !r.whale_signal && !r.big_player_anomaly && !r.net_foreign_30d && (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sig.dot}`} />
                          <Link
                            href={`/stock/${r.stock_code}`}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${sig.className} hover:opacity-80 transition-opacity`}
                          >
                            {sig.label}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Menampilkan <span className="text-foreground font-semibold">{filtered.length}</span> dari{' '}
              <span className="text-foreground font-semibold">{results.length}</span> emiten
            </p>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">🕵️ Stealth</span>
              <span className="flex items-center gap-1">🐋 Whale</span>
              <span className="flex items-center gap-1">⚡ Big Player</span>
              <span className="flex items-center gap-1">🌏 Foreign Buy</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
