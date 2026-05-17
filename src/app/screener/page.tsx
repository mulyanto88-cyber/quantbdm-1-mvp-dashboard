'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatRupiah, formatNumber } from '@/lib/utils'
import { Search, RefreshCw, TrendingUp, X, AlertTriangle, SlidersHorizontal, Radar, Download, Share2, ChevronLeft, ChevronRight, Maximize2, EyeOff, Zap, Star, Filter, Clock } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockRow {
  stock_code: string
  sector: string
  close: number
  change_percent: number
  smart_score: number
  net_foreign_period: number
  aov_max: number
  spike_count: number
  anomaly_count: number
  is_stealth: boolean
  whale_signal: boolean
  big_player_anomaly: boolean
  signal: string
}

type SortField = 'smart_score' | 'change_percent' | 'net_foreign_period' | 'aov_max' | 'spike_count' | 'anomaly_count' | 'close' | 'stock_code'

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '1D',  days: 1 },
  { label: '7D',  days: 7 },
  { label: '14D', days: 14 },
  { label: '1M',  days: 30 },
  { label: '3M',  days: 90 },
]

const SIGNAL_STYLE: Record<string, string> = {
  '🚀 STRONG BUY': 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20',
  '👀 WATCH':      'bg-amber-500/20 text-amber-400 border border-amber-500/20',
  '➖ NEUTRAL':    'bg-slate-500/20 text-slate-400 border border-slate-500/20',
}

const PRESETS = [
  { id: 'whale-hunt',    name: '🐋 Whale Hunt',    icon: Zap,         filters: { flag: 'WHALE',       minScore: 50 } },
  { id: 'foreign-flow',  name: '🌏 Foreign Flow',  icon: TrendingUp,  filters: { flag: 'FOREIGN_BUY', minScore: 40 } },
  { id: 'accumulation',  name: '📈 Accumulation',  icon: Star,        filters: { signal: '🚀 STRONG BUY', minScore: 50 } },
  { id: 'stealth-mode',  name: '🕵️ Stealth Mode',  icon: EyeOff,      filters: { flag: 'STEALTH',     minScore: 35 } },
  { id: 'big-player',    name: '⚡ Big Player',     icon: Zap,         filters: { flag: 'BIG_PLAYER',  minScore: 45 } },
]

// ─── API Helper (Direct MotherDuck via fetch) ─────────────────────────────────
async function mdQuery(query: string): Promise<any[]> {
  const res = await fetch('https://api.motherduck.com/v1/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_MOTHERDUCK_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      database: 'my_db',
      query: query,
    }),
  })
  
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err)
  }
  
  const json = await res.json()
  const result = json.results?.[0]
  if (!result) return []
  
  const columns = result.columns?.map((c: any) => c.name) || []
  const rows = result.rows || []
  
  return rows.map((row: any[]) => {
    const obj: Record<string, any> = {}
    columns.forEach((col: string, i: number) => {
      obj[col] = row[i]
    })
    return obj
  })
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ScreenerPage() {
  const router = useRouter()

  // States
  const [results, setResults] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastDate, setLastDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showPresets, setShowPresets] = useState(false)

  // Filter states
  const [period, setPeriod] = useState(7)
  const [filterSignal, setFilterSignal] = useState('ALL')
  const [filterFlag, setFilterFlag] = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [minScore, setMinScore] = useState(20)

  // Sort & pagination
  const [sortBy, setSortBy] = useState<SortField>('smart_score')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const periodLabel = period === 30 ? '1M' : period === 90 ? '3M' : `${period}D`

  // ─── Fetch Data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
  
    try {
      // 1. Smart Money Score
      const smData = await mdQuery(`
        SELECT 
          stock_code,
          COALESCE(sector, 'Others') AS sector,
          close,
          change_percent,
          smart_money_score,
          whale_signal,
          big_player_anomaly,
          signal
        FROM market.vw_smart_money_score
        WHERE smart_money_score > 0
        ORDER BY smart_money_score DESC
      `)
  
      // 2. Period data dari tabel screener_period (1 query saja!)
      const periodData = await mdQuery(`SELECT * FROM market.screener_period`)
  
      // Build map
      const periodMap = new Map<string, any>()
      periodData.forEach((d: any) => periodMap.set(d.stock_code, d))
  
      // Gabungkan
      const merged: StockRow[] = smData.map((r: any) => {
        const p = periodMap.get(r.stock_code) || {}
        
        // Pilih spike_count & foreign sesuai periode
        const spikeKey = `spike_${period}d`
        const foreignKey = `foreign_${period}d`
  
        return {
          stock_code: r.stock_code,
          sector: r.sector || '—',
          close: Number(r.close || 0),
          change_percent: Number(r.change_percent || 0),
          smart_score: Number(r.smart_money_score || 0),
          net_foreign_period: Number(p[foreignKey] || 0),
          aov_max: Number(p.aov_max || 0),
          spike_count: Number(p[spikeKey] || 0),
          anomaly_count: r.big_player_anomaly ? 5 : 0,
          is_stealth: Number(r.change_percent) >= -2 && Number(r.change_percent) <= 2 && Number(r.smart_money_score) >= 60,
          whale_signal: r.whale_signal || false,
          big_player_anomaly: r.big_player_anomaly || false,
          signal: r.signal || '➖ NEUTRAL',
        }
      })
  
      setResults(merged)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [period])

  // ─── Filter & Sort ──────────────────────────────────────────────────────────
  const sectors = useMemo(() =>
    ['ALL', ...Array.from(new Set(results.map(r => r.sector).filter(Boolean))).sort()],
    [results]
  )

  const signals = useMemo(() =>
    ['ALL', '🚀 STRONG BUY', '👀 WATCH', '➖ NEUTRAL'],
    []
  )

  const filtered = useMemo(() => results
    .filter(r => {
      if (filterSignal !== 'ALL' && r.signal !== filterSignal) return false
      if (filterSector !== 'ALL' && r.sector !== filterSector) return false
      if (filterFlag === 'WHALE' && !r.whale_signal) return false
      if (filterFlag === 'BIG_PLAYER' && !r.big_player_anomaly) return false
      if (filterFlag === 'FOREIGN_BUY' && r.net_foreign_period <= 0) return false
      if (filterFlag === 'STEALTH' && !r.is_stealth) return false
      if (r.smart_score < minScore) return false
      return true
    })
    .sort((a, b) => {
      const aVal = a[sortBy as keyof StockRow]
      const bVal = b[sortBy as keyof StockRow]
      const cmp = typeof aVal === 'string'
        ? (aVal as string).localeCompare(bVal as string)
        : Number(aVal) - Number(bVal)
      return sortDir === 'desc' ? -cmp : cmp
    }),
    [results, filterSignal, filterSector, filterFlag, minScore, sortBy, sortDir]
  )

  // ─── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginatedData = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => { setPage(1) }, [filterSignal, filterSector, filterFlag, minScore, period])

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const toggleSort = (col: SortField) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const f = preset.filters
    setFilterSignal(f.signal || 'ALL')
    setFilterFlag(f.flag || 'ALL')
    setMinScore(f.minScore || 0)
    setShowPresets(false)
  }

  const resetFilters = () => {
    setFilterSignal('ALL')
    setFilterSector('ALL')
    setFilterFlag('ALL')
    setMinScore(20)
    setPeriod(7)
  }

  const exportToCSV = () => {
    const headers = ['Kode', 'Sektor', 'Close', 'Chg%', 'Score', 'Foreign', 'AOV Max', 'Spikes', 'Signal']
    const rows = filtered.map(r => [
      r.stock_code, r.sector, r.close, `${r.change_percent.toFixed(2)}%`,
      r.smart_score, formatRupiah(r.net_foreign_period), `${r.aov_max.toFixed(2)}x`,
      r.spike_count, r.signal
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `screener-${lastDate}-${filtered.length}stocks.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const shareLink = () => {
    const url = `${window.location.origin}/screener`
    navigator.clipboard.writeText(url)
    alert('Link copied!')
  }

  const SortArrow = ({ col }: { col: SortField }) =>
    sortBy === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : null

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-5 animate-fade-in pb-10 ${fullscreen ? 'fixed inset-4 z-50 bg-background/95 backdrop-blur-sm p-6 overflow-auto rounded-2xl' : ''}`}>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Radar className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Screener</span> <span className="text-foreground">Pro</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {filtered.length} / {results.length} stocks · {lastDate} · {periodLabel} window
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button onClick={() => setShowPresets(p => !p)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gold-400/30 bg-gold-400/10 text-gold-400 text-xs font-bold hover:bg-gold-400/20 transition-all">
              <Zap className="w-4 h-4" /> Presets
            </button>
            {showPresets && (
              <div className="absolute right-0 top-full mt-2 glass rounded-xl border border-gold-400/20 shadow-2xl z-50 min-w-[200px] overflow-hidden">
                {PRESETS.map(preset => (
                  <button key={preset.id} onClick={() => applyPreset(preset)}
                    className="w-full px-4 py-3 text-left text-xs hover:bg-gold-400/10 flex items-center gap-3 border-b border-white/[0.05] last:border-0">
                    <preset.icon className="w-4 h-4 text-gold-400" />
                    <span className="font-semibold">{preset.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${showFilters ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'glass border-border/30 text-muted-foreground hover:text-foreground'}`}>
            <SlidersHorizontal className="w-4 h-4" /> Filter
          </button>
          <button onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-muted-foreground text-xs font-bold hover:text-foreground">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={shareLink}
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-muted-foreground text-xs font-bold hover:text-foreground">
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button onClick={() => setFullscreen(f => !f)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl glass border text-xs font-bold ${fullscreen ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'border-border/30 text-muted-foreground hover:text-foreground'}`}>
            {fullscreen ? <EyeOff className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-xs font-bold hover:bg-gold-400/20 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Scan
          </button>
          {(filterSignal !== 'ALL' || filterFlag !== 'ALL' || minScore > 20) && (
            <button onClick={resetFilters} className="text-xs text-red-400 hover:text-red-300 underline">Reset</button>
          )}
        </div>
      </div>

      {/* PERIOD TOGGLE + PRESETS */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
          <Clock className="w-3.5 h-3.5 text-muted-foreground ml-2" />
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.days} onClick={() => setPeriod(opt.days)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                period === opt.days ? 'bg-gold-400/20 text-gold-400' : 'text-muted-foreground hover:text-white'
              }`}>{opt.label}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {PRESETS.map(preset => (
            <button key={preset.id} onClick={() => applyPreset(preset)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-white/[0.06] text-[10px] font-semibold hover:border-gold-400/30 transition-all">
              <preset.icon className="w-3 h-3 text-gold-400" />
              {preset.name.split(' ')[1]}
            </button>
          ))}
        </div>
      </div>

      {/* FILTERS */}
      {showFilters && (
        <div className="glass rounded-2xl p-5 border border-gold-400/20 space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-gold-400 flex items-center gap-2"><Filter className="w-4 h-4" /> Advanced Filters</h3>
            <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground underline">Reset All</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Signal</label>
              <select value={filterSignal} onChange={e => setFilterSignal(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                {signals.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Sektor</label>
              <select value={filterSector} onChange={e => setFilterSector(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Flag</label>
              <select value={filterFlag} onChange={e => setFilterFlag(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                <option value="ALL">Semua</option>
                <option value="WHALE">🐋 Whale</option>
                <option value="BIG_PLAYER">⚡ Big Player</option>
                <option value="FOREIGN_BUY">🌏 Foreign Buy</option>
                <option value="STEALTH">🕵️ Stealth</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Min Score: <span className="text-gold-400 font-bold">{minScore}</span></label>
              <input type="range" min={0} max={80} step={5} value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="w-full accent-amber-400 mt-2" />
            </div>
          </div>
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* TABLE */}
      {loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i) => <div key={i} className="shimmer h-12 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 border border-border/30 text-center">
          <Radar className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-2">No results</h3>
          <p className="text-muted-foreground text-sm mb-4">Try adjusting filters</p>
          <button onClick={resetFilters} className="px-6 py-2.5 bg-gold-400/20 border border-gold-400/30 text-gold-400 rounded-xl text-sm font-bold hover:bg-gold-400/30 transition-all">Reset</button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Showing <span className="text-gold-400 font-bold">{paginatedData.length}</span> of <span className="text-foreground font-bold">{filtered.length}</span>
            </p>
            <p className="text-xs text-muted-foreground">Sort: <span className="text-gold-400 font-bold">{sortBy.replace(/_/g, ' ')}</span> ({sortDir})</p>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[9px] text-muted-foreground uppercase tracking-wider">
                    <th className="p-2 text-left w-6">#</th>
                    <th className="p-2 text-left sticky left-0 bg-[#0B0F19]/95 backdrop-blur-sm z-10 cursor-pointer hover:text-foreground" onClick={() => toggleSort('stock_code')}>Kode<SortArrow col="stock_code" /></th>
                    <th className="p-2 text-left hidden md:table-cell">Sektor</th>
                    <th className="p-2 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('close')}>Close<SortArrow col="close" /></th>
                    <th className="p-2 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('change_percent')}>Chg%<SortArrow col="change_percent" /></th>
                    <th className="p-2 text-center cursor-pointer hover:text-foreground" onClick={() => toggleSort('smart_score')}>Score<SortArrow col="smart_score" /></th>
                    <th className="p-2 text-right cursor-pointer hover:text-foreground hidden lg:table-cell" onClick={() => toggleSort('net_foreign_period')}>Foreign ({periodLabel})<SortArrow col="net_foreign_period" /></th>
                    <th className="p-2 text-center cursor-pointer hover:text-foreground" onClick={() => toggleSort('aov_max')}>AOV Max<SortArrow col="aov_max" /></th>
                    <th className="p-2 text-center cursor-pointer hover:text-foreground" onClick={() => toggleSort('spike_count')}>Spikes<SortArrow col="spike_count" /></th>
                    <th className="p-2 text-center hidden lg:table-cell cursor-pointer hover:text-foreground" onClick={() => toggleSort('anomaly_count')}>Anomaly<SortArrow col="anomaly_count" /></th>
                    <th className="p-2 text-center">Flags</th>
                    <th className="p-2 text-center">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((r, i) => (
                    <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02] group hover:bg-gold-400/[0.03] transition-all">
                      <td className="p-2 text-[10px] text-muted-foreground">{(page - 1) * pageSize + i + 1}</td>
                      <td className="p-2 sticky left-0 bg-[#0B0F19] group-hover:bg-[#0B0F19]/95 backdrop-blur-sm z-10">
                        <Link href={`/stock/${r.stock_code}`} className="block">
                          <p className="font-black font-mono text-xs text-foreground group-hover:text-gold-400 transition-colors">{r.stock_code}</p>
                        </Link>
                      </td>
                      <td className="p-2 hidden md:table-cell text-[10px] text-muted-foreground truncate max-w-[100px]">{r.sector || '—'}</td>
                      <td className="p-2 text-right font-semibold text-foreground">{formatNumber(r.close)}</td>
                      <td className={`p-2 text-right font-bold ${r.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.change_percent >= 0 ? '+' : ''}{r.change_percent.toFixed(2)}%
                      </td>
                      <td className="p-2 text-center">
                        <span className={`text-sm font-black ${r.smart_score >= 60 ? 'text-emerald-400' : r.smart_score >= 40 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                          {Math.round(r.smart_score)}
                        </span>
                      </td>
                      <td className={`p-2 text-right hidden lg:table-cell font-semibold ${r.net_foreign_period >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatRupiah(r.net_foreign_period)}
                      </td>
                      <td className="p-2 text-center">
                        {r.aov_max > 0 ? (
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono ${r.aov_max >= 2 ? 'bg-purple-500/20 text-purple-400' : r.aov_max >= 1.5 ? 'bg-blue-500/20 text-blue-400' : 'bg-white/[0.04] text-muted-foreground'}`}>
                            {r.aov_max.toFixed(2)}x
                          </span>
                        ) : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="p-2 text-center">
                        <span className={`font-bold ${r.spike_count >= 3 ? 'text-purple-400' : r.spike_count >= 1 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                          {r.spike_count}
                        </span>
                      </td>
                      <td className="p-2 text-center hidden lg:table-cell">
                        <span className={`font-bold ${r.anomaly_count >= 5 ? 'text-purple-400' : r.anomaly_count >= 2 ? 'text-amber-400' : r.anomaly_count > 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                          {r.anomaly_count}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex justify-center gap-1">
                          {r.whale_signal && <span title="Whale">🐋</span>}
                          {r.big_player_anomaly && <span title="Big Player">⚡</span>}
                          {r.is_stealth && <span title="Stealth">🕵️</span>}
                          {r.net_foreign_period > 0 && <span title="Foreign Buy">🌏</span>}
                          {!r.whale_signal && !r.big_player_anomaly && !r.is_stealth && r.net_foreign_period <= 0 && (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <Link href={`/stock/${r.stock_code}`}>
                          <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${SIGNAL_STYLE[r.signal] || SIGNAL_STYLE['➖ NEUTRAL']} hover:scale-105 inline-block transition-transform`}>
                            {r.signal}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-xs font-bold disabled:opacity-50">
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <span className="text-xs text-muted-foreground">Page <span className="text-gold-400 font-bold">{page}</span> of <span className="font-bold">{totalPages}</span></span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-xs font-bold disabled:opacity-50">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
