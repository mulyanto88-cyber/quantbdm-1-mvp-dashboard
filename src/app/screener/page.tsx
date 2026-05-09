'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber } from '@/lib/utils'
import { Search, RefreshCw, TrendingUp, TrendingDown, X, AlertTriangle, SlidersHorizontal, Radar, Download, Share2, ChevronLeft, ChevronRight, Eye, EyeOff, Zap, Star, Filter, Save, Trash2, ExternalLink, ArrowUpDown, Maximize2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

interface Stock {
  stock_code: string
  sector: string
  close: number
  change_percent: number
  value: number
  net_foreign_value: number
  whale_signal: boolean
  big_player_anomaly: boolean
  signal: string
  aov_ratio_ma20: number
  smart_score: number
}

const SIGNAL_STYLE: Record<string, string> = {
  Akumulasi:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20',
  Distribusi:  'bg-red-500/20 text-red-400 border border-red-500/20',
  Netral:      'bg-slate-500/20 text-slate-400 border border-slate-500/20',
  STRONG_BUY:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20',
  WATCH:       'bg-amber-500/20 text-amber-400 border border-amber-500/20',
  NEUTRAL:     'bg-slate-500/20 text-slate-400 border border-slate-500/20',
  AVOID:       'bg-red-500/20 text-red-400 border border-red-500/20',
}

const PRESETS = [
  { id: 'whale-hunt', name: '🐋 Whale Hunt', icon: Zap, filters: { flag: 'WHALE', minScore: 50 } },
  { id: 'foreign-flow', name: '🌏 Foreign Flow', icon: TrendingUp, filters: { flag: 'FOREIGN_BUY', signal: 'Akumulasi' } },
  { id: 'accumulation', name: '📈 Accumulation', icon: Star, filters: { signal: 'Akumulasi', minScore: 40 } },
  { id: 'stealth-mode', name: '🕵️ Stealth Mode', icon: Eye, filters: { flag: 'STEALTH', minScore: 35 } },
  { id: 'big-player', name: '⚡ Big Player', icon: Lightning, filters: { flag: 'BIG_PLAYER', minScore: 45 } },
]

function computeScore(r: any): number {
  let score = 0
  const sig = r.signal || ''
  if (sig === 'Akumulasi' || sig === 'STRONG_BUY') score += 50
  else if (sig === 'WATCH') score += 35
  else if (sig === 'Netral' || sig === 'NEUTRAL') score += 20
  if (r.whale_signal)        score += 20
  if (r.big_player_anomaly)  score += 15
  const aov = Number(r.aov_ratio_ma20) || 1
  if (aov >= 2)   score += 15
  else if (aov >= 1.5) score += 8
  if (Number(r.net_foreign_value) > 0) score += 10
  return Math.min(score, 100)
}

type SortField = 'smart_score'|'change_percent'|'value'|'net_foreign_value'|'aov_ratio_ma20'|'stock_code'
type ColumnKey = 'code'|'change'|'score'|'aov'|'foreign'|'flags'|'signal'|'sector'

interface FilterState {
  signal: string
  sector: string
  flag: string
  minScore: number
  search: string
}

const DEFAULT_COLUMNS: ColumnKey[] = ['code', 'change', 'score', 'aov', 'foreign', 'flags', 'signal']

export default function ScreenerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [results, setResults]   = useState<Stock[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [lastDate, setLastDate] = useState('')

  // Filter states
  const [search, setSearch]     = useState('')
  const [filterSignal, setFilterSignal] = useState('ALL')
  const [filterFlag, setFilterFlag]     = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [minScore, setMinScore] = useState(0)

  // Sort & pagination
  const [sortBy, setSortBy]     = useState<SortField>('smart_score')
  const [sortDir, setSortDir]   = useState<'desc'|'asc'>('desc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // UI states
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS)
  const [showPresets, setShowPresets] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Load filters from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get('s')) setSearch(params.get('s')!)
    if (params.get('sig')) setFilterSignal(params.get('sig')!)
    if (params.get('sec')) setFilterSector(params.get('sec')!)
    if (params.get('flag')) setFilterFlag(params.get('flag')!)
    if (params.get('score')) setMinScore(Number(params.get('score')))
    if (params.get('sort')) setSortBy(params.get('sort') as SortField)
    if (params.get('dir')) setSortDir(params.get('dir') as 'desc'|'asc')
  }, [searchParams])

  // Sync filters to URL
  const updateUrlParams = useCallback((filters: Partial<FilterState>) => {
    const params = new URLSearchParams(searchParams.toString())
    if (filters.search !== undefined) filters.search ? params.set('s', filters.search) : params.delete('s')
    if (filters.signal !== undefined) filters.signal !== 'ALL' ? params.set('sig', filters.signal) : params.delete('sig')
    if (filters.sector !== undefined) filters.sector !== 'ALL' ? params.set('sec', filters.sector) : params.delete('sec')
    if (filters.flag !== undefined) filters.flag !== 'ALL' ? params.set('flag', filters.flag) : params.delete('flag')
    if (filters.minScore !== undefined) filters.minScore > 0 ? params.set('score', String(filters.minScore)) : params.delete('score')
    params.set('sort', sortBy)
    params.set('dir', sortDir)
    router.push(`/screener?${params.toString()}`, { scroll: false })
  }, [searchParams, sortBy, sortDir, router])

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: dd } = await supabase
        .from('daily_transactions').select('trading_date')
        .order('trading_date', { ascending: false }).limit(1)
      const date = dd?.[0]?.trading_date
      if (!date) throw new Error('No trading data found')
      setLastDate(date)

      const { data, error: e } = await supabase
        .from('daily_transactions')
        .select('stock_code,sector,close,change_percent,value,net_foreign_value,whale_signal,big_player_anomaly,signal,aov_ratio_ma20')
        .eq('trading_date', date)
        .gt('value', 500_000_000)
        .limit(2000)
      if (e) throw e

      const scored: Stock[] = (data || []).map((r: any) => ({
        ...r,
        close: Number(r.close),
        change_percent: Number(r.change_percent),
        value: Number(r.value),
        net_foreign_value: Number(r.net_foreign_value),
        aov_ratio_ma20: Number(r.aov_ratio_ma20),
        smart_score: computeScore(r),
      }))
      setResults(scored)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const sectors = useMemo(() =>
    ['ALL', ...Array.from(new Set(results.map(r => r.sector).filter(Boolean))).sort()],
    [results]
  )

  const signals = useMemo(() =>
    ['ALL', ...Array.from(new Set(results.map(r => r.signal).filter(Boolean)))],
    [results]
  )

  // Apply filters
  const filtered = useMemo(() => results
    .filter(r => {
      if (search && !r.stock_code.includes(search.toUpperCase()) && !r.sector?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterSignal !== 'ALL' && r.signal !== filterSignal) return false
      if (filterSector !== 'ALL' && r.sector !== filterSector) return false
      if (filterFlag === 'WHALE' && !r.whale_signal) return false
      if (filterFlag === 'BIG_PLAYER' && !r.big_player_anomaly) return false
      if (filterFlag === 'FOREIGN_BUY' && r.net_foreign_value <= 0) return false
      if (filterFlag === 'STEALTH' && !(r.aov_ratio_ma20 >= 1.5)) return false
      if (r.smart_score < minScore) return false
      return true
    })
    .sort((a, b) => {
      const aVal = a[sortBy as keyof Stock]
      const bVal = b[sortBy as keyof Stock]
      const cmp = typeof aVal === 'string'
        ? aVal.localeCompare(bVal as string)
        : Number(aVal) - Number(bVal)
      return sortDir === 'desc' ? -cmp : cmp
    }), [results, search, filterSignal, filterSector, filterFlag, minScore, sortBy, sortDir])

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginatedData = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, filterSignal, filterSector, filterFlag, minScore])

  // Stats calculations
  const stats = useMemo(() => ({
    total: results.length,
    akumulasi: results.filter(r => r.signal === 'Akumulasi' || r.signal === 'STRONG_BUY').length,
    whale:     results.filter(r => r.whale_signal).length,
    foreign:   results.filter(r => r.net_foreign_value > 0).length,
    avg:       results.length ? Math.round(results.reduce((s, r) => s + r.smart_score, 0) / results.length) : 0,
  }), [results])

  const toggleSort = (col: SortField) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc'); updateUrlParams({}) }
  }

  const SortArrow = ({ col }: { col: SortField }) =>
    sortBy === col ? (sortDir === 'desc' ? <TrendingDown className="w-3 h-3 inline ml-1" /> : <TrendingUp className="w-3 h-3 inline ml-1" />) : null

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const f = preset.filters
    setFilterSignal(f.signal || 'ALL')
    setFilterFlag(f.flag || 'ALL')
    setMinScore(f.minScore || 0)
    setShowPresets(false)
    updateUrlParams({ signal: f.signal || 'ALL', flag: f.flag || 'ALL', minScore: f.minScore || 0 })
  }

  const resetFilters = () => {
    setSearch('')
    setFilterSignal('ALL')
    setFilterSector('ALL')
    setFilterFlag('ALL')
    setMinScore(0)
    router.push('/screener')
  }

  const exportToCSV = () => {
    const headers = ['Kode', 'Sektor', 'Harga', 'Chg%', 'Value', 'Foreign', 'AOV', 'Score', 'Signal']
    const rows = filtered.map(r => [
      r.stock_code, r.sector, r.close, `${r.change_percent.toFixed(2)}%`,
      formatNumber(r.value), formatRupiah(r.net_foreign_value), `${r.aov_ratio_ma20.toFixed(2)}x`,
      r.smart_score, r.signal
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `screener-${lastDate}-${filtered.length}stocks.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareLink = () => {
    const url = `${window.location.origin}/screener?${new URLSearchParams(searchParams.toString()).toString()}`
    navigator.clipboard.writeText(url)
    alert('Link filter disalin ke clipboard!')
  }

  const toggleColumn = (col: ColumnKey) => {
    setVisibleColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  return (
    <div className={`space-y-6 animate-fade-in pb-10 ${fullscreen ? 'fixed inset-4 z-50 bg-background/95 backdrop-blur-sm p-6 overflow-auto' : ''}`}>
      {/* Header dengan Action Buttons */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">
              <Radar className="w-8 h-8 text-gold-400 inline mr-2" />
              <span className="gradient-gold">Screener</span> <span className="text-foreground">Pro</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{filtered.length} / {results.length} emiten · Data {lastDate}</p>
          </div>
          {(filterSignal !== 'ALL' || filterFlag !== 'ALL' || minScore > 0 || search) && (
            <button onClick={resetFilters} className="text-xs text-gold-400 hover:text-gold-300 underline">
              Reset Filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets Dropdown */}
          <div className="relative">
            <button onClick={() => setShowPresets(p => !p)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gold-400/30 bg-gold-400/10 text-gold-400 text-xs font-bold hover:bg-gold-400/20 transition-all">
              <Zap className="w-4 h-4" /> Presets
            </button>
            {showPresets && (
              <div className="absolute right-0 top-full mt-2 glass rounded-xl border border-gold-400/20 shadow-2xl z-50 min-w-[200px] overflow-hidden animate-fade-in">
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
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${showFilters ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'glass border-border/30 text-muted-foreground hover:text-foreground'}`}>
            <SlidersHorizontal className="w-4 h-4" /> Filter
          </button>

          <button onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass border border-border/30 text-muted-foreground text-xs font-bold hover:text-foreground">
            <Download className="w-4 h-4" /> CSV
          </button>

          <button onClick={shareLink}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass border border-border/30 text-muted-foreground text-xs font-bold hover:text-foreground">
            <Share2 className="w-4 h-4" /> Share
          </button>

          <button onClick={() => setFullscreen(f => !f)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl glass border text-xs font-bold ${fullscreen ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'border-border/30 text-muted-foreground hover:text-foreground'}`}>
            {fullscreen ? <EyeOff className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button onClick={fetch} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-xs font-bold hover:bg-gold-400/20 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Scan
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Universe',   value: stats.total,     color: 'text-foreground',  icon: '📊' },
          { label: 'Akumulasi',  value: stats.akumulasi, color: 'text-emerald-400', icon: '📈' },
          { label: 'Whale',      value: stats.whale,     color: 'text-blue-400',    icon: '🐋' },
          { label: 'Foreign +',  value: stats.foreign,   color: 'text-cyan-400',    icon: '🌏' },
          { label: 'Avg Score',  value: stats.avg,       color: 'text-gold-400',    icon: '⭐' },
        ].map((m, i) => (
          <div key={i} className="glass rounded-xl p-4 border border-border/30 hover:border-gold-400/20 transition-all group">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
              <span className="text-lg">{m.icon}</span>
            </div>
            <p className={`text-2xl font-black mt-2 ${m.color} group-hover:scale-110 transition-transform`}>{m.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Quick Presets Bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {PRESETS.map(preset => (
          <button key={preset.id} onClick={() => applyPreset(preset)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl glass border border-white/[0.08] text-xs font-semibold hover:border-gold-400/30 hover:bg-gold-400/10 transition-all">
            <preset.icon className="w-4 h-4 text-gold-400" />
            {preset.name.split(' ')[1]}
          </button>
        ))}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="glass rounded-2xl p-5 border border-gold-400/20 space-y-4 animate-fade-in">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold text-gold-400 flex items-center gap-2">
              <Filter className="w-4 h-4" /> Advanced Filters
            </h3>
            <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
              Reset All
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Signal</label>
              <select value={filterSignal} onChange={e => { setFilterSignal(e.target.value); updateUrlParams({ signal: e.target.value }) }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                {signals.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Sektor</label>
              <select value={filterSector} onChange={e => { setFilterSector(e.target.value); updateUrlParams({ sector: e.target.value }) }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Flag Khusus</label>
              <select value={filterFlag} onChange={e => { setFilterFlag(e.target.value); updateUrlParams({ flag: e.target.value }) }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                <option value="ALL">Semua</option>
                <option value="WHALE">🐋 Whale Signal</option>
                <option value="BIG_PLAYER">⚡ Big Player</option>
                <option value="FOREIGN_BUY">🌏 Foreign Net Buy</option>
                <option value="STEALTH">🕵️ AOV Spike ≥1.5x</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">
                Min Score: <span className="text-gold-400 font-bold">{minScore}</span>
              </label>
              <input type="range" min={0} max={80} step={5} value={minScore}
                onChange={e => { setMinScore(Number(e.target.value)); updateUrlParams({ minScore: Number(e.target.value) }) }}
                className="w-full accent-amber-400 mt-2" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Page Size</label>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={200}>200 / page</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Columns</label>
              <button onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-left flex justify-between items-center">
                <span>{visibleColumns.length} visible</span>
                <ChevronLeft className={`w-3 h-3 transition-transform ${showColumnPicker ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Column Picker */}
          {showColumnPicker && (
            <div className="border-t border-white/[0.05] pt-4 mt-2">
              <div className="flex flex-wrap gap-2">
                {(['code', 'sector', 'change', 'score', 'aov', 'foreign', 'flags', 'signal'] as ColumnKey[]).map(col => (
                  <button key={col} onClick={() => toggleColumn(col)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${visibleColumns.includes(col)
                      ? 'bg-gold-400/20 border-gold-400/40 text-gold-400'
                      : 'bg-white/[0.03] border-white/[0.08] text-muted-foreground'}`}>
                    {col === 'code' ? 'Kode' : col === 'change' ? 'Change%' : col === 'score' ? 'Score' : col === 'aov' ? 'AOV' : col === 'foreign' ? 'Foreign' : col.charAt(0).toUpperCase() + col.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3 focus-within:border-gold-400/30 transition-all">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input type="text" placeholder="Cari kode saham atau sektor... (tekan Enter)" value={search}
          onChange={e => setSearch(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && updateUrlParams({ search })}
          className="flex-1 bg-transparent text-sm focus:outline-none" />
        {search && (
          <button onClick={() => { setSearch(''); updateUrlParams({ search: '' }) }} className="p-1 hover:bg-white/[0.05] rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <span className="text-xs text-muted-foreground px-2 py-1 bg-white/[0.05] rounded-lg">{filtered.length} hasil</span>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5" /><span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i) => <div key={i} className="shimmer h-12 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 border border-border/30 text-center">
          <Radar className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-2">Tidak ada hasil ditemukan</h3>
          <p className="text-muted-foreground text-sm mb-4">Coba ubah filter atau reset untuk melihat semua saham</p>
          <button onClick={resetFilters} className="px-6 py-2.5 bg-gold-400/20 border border-gold-400/30 text-gold-400 rounded-xl text-sm font-bold hover:bg-gold-400/30 transition-all">
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* Table Header Info */}
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-muted-foreground">
              Menampilkan <span className="text-gold-400 font-bold">{paginatedData.length}</span> dari <span className="text-foreground font-bold">{filtered.length}</span> saham
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <span className="text-xs font-bold text-gold-400">{sortBy.replace('_', ' ').toUpperCase()}</span>
              <span className="text-xs text-muted-foreground">({sortDir})</span>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase tracking-wider">
                    {visibleColumns.includes('code') && <th className="p-3 text-left w-8">#</th>}
                    {visibleColumns.includes('code') && <th className="p-3 text-left sticky left-0 bg-[#0B0F19]/95 backdrop-blur-sm z-10">Emiten</th>}
                    {visibleColumns.includes('sector') && <th className="p-3 text-left hidden md:table-cell">Sektor</th>}
                    {visibleColumns.includes('change') && (
                      <th className="p-3 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('change_percent')}>
                        Chg% <SortArrow col="change_percent" />
                      </th>
                    )}
                    {visibleColumns.includes('score') && (
                      <th className="p-3 text-center cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('smart_score')}>
                        Score <SortArrow col="smart_score" />
                      </th>
                    )}
                    {visibleColumns.includes('aov') && (
                      <th className="p-3 text-center cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('aov_ratio_ma20')}>
                        AOV Ratio <SortArrow col="aov_ratio_ma20" />
                      </th>
                    )}
                    {visibleColumns.includes('foreign') && (
                      <th className="p-3 text-right hidden lg:table-cell cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('net_foreign_value')}>
                        Foreign <SortArrow col="net_foreign_value" />
                      </th>
                    )}
                    {visibleColumns.includes('flags') && <th className="p-3 text-center">Flags</th>}
                    {visibleColumns.includes('signal') && <th className="p-3 text-center">Signal</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((r, i) => (
                    <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02] group hover:bg-gold-400/[0.03] transition-all">
                      {visibleColumns.includes('code') && <td className="p-3 text-[11px] text-muted-foreground">{(page - 1) * pageSize + i + 1}</td>}
                      {visibleColumns.includes('code') && (
                        <td className="p-3 sticky left-0 bg-[#0B0F19] group-hover:bg-[#0B0F19]/95 backdrop-blur-sm z-10">
                          <Link href={`/stock/${r.stock_code}`} className="block group/link">
                            <p className="font-black font-mono text-base text-foreground group-hover/link:text-gold-400 transition-colors">{r.stock_code}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[130px] md:hidden">{r.sector || '—'}</p>
                          </Link>
                        </td>
                      )}
                      {visibleColumns.includes('sector') && (
                        <td className="p-3 hidden md:table-cell"><p className="text-xs text-muted-foreground">{r.sector || '—'}</p></td>
                      )}
                      {visibleColumns.includes('change') && (
                        <td className={`p-3 text-right font-bold ${r.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {r.change_percent >= 0 ? '▲' : '▼'} {Math.abs(r.change_percent).toFixed(2)}%
                        </td>
                      )}
                      {visibleColumns.includes('score') && (
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-lg font-black ${r.smart_score >= 60 ? 'text-emerald-400' : r.smart_score >= 40 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                              {r.smart_score}
                            </span>
                            <div className="w-12 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                              <div className={`h-full rounded-full ${r.smart_score >= 60 ? 'bg-emerald-400' : r.smart_score >= 40 ? 'bg-amber-400' : 'bg-slate-500'}`} style={{width:`${r.smart_score}%`}} />
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('aov') && (
                        <td className="p-3 text-center">
                          {(() => {
                            const aov = r.aov_ratio_ma20
                            const aovColor = aov >= 2 ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                             aov >= 1.5 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                             aov <= 0.6 && aov > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                             'bg-white/[0.04] text-muted-foreground border border-white/[0.06]'
                            return (
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold font-mono ${aovColor}`}>
                                {aov > 0 ? `${aov.toFixed(2)}x` : '—'}
                              </span>
                            )
                          })()}
                        </td>
                      )}
                      {visibleColumns.includes('foreign') && (
                        <td className={`p-3 text-right hidden lg:table-cell font-semibold ${r.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatRupiah(r.net_foreign_value)}
                        </td>
                      )}
                      {visibleColumns.includes('flags') && (
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1.5">
                            {r.whale_signal && <span title="Whale Signal" className="hover:scale-125 transition-transform">🐋</span>}
                            {r.big_player_anomaly && <span title="Big Player Anomaly" className="hover:scale-125 transition-transform">⚡</span>}
                            {r.net_foreign_value > 0 && <span title="Foreign Net Buy" className="hover:scale-125 transition-transform">🌏</span>}
                            {r.aov_ratio_ma20 >= 1.5 && <span title="AOV Spike" className="hover:scale-125 transition-transform">📊</span>}
                            {!r.whale_signal && !r.big_player_anomaly && r.net_foreign_value <= 0 && r.aov_ratio_ma20 < 1.5 && (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('signal') && (
                        <td className="p-3 text-center">
                          <Link href={`/stock/${r.stock_code}`}>
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${SIGNAL_STYLE[r.signal] || SIGNAL_STYLE.NEUTRAL} hover:scale-105 inline-block transition-transform`}>
                              {r.signal || 'Netral'}
                            </span>
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:border-gold-400/30 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Page</span>
                  <span className="text-sm font-bold text-gold-400">{page}</span>
                  <span className="text-xs text-muted-foreground">of</span>
                  <span className="text-sm font-bold text-foreground">{totalPages}</span>
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:border-gold-400/30 transition-all">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="p-3 border-t border-white/[0.05] text-[10px] text-muted-foreground bg-white/[0.02]">
              💡 Score Formula: Signal(50) + Whale(20) + BigPlayer(15) + AOV(15) + Foreign(10) = Max 100
            </div>
          </div>
        </>
      )}
    </div>
  )
}

+++ src/app/screener/page.tsx (修改后)
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber } from '@/lib/utils'
import { Search, RefreshCw, TrendingUp, TrendingDown, X, AlertTriangle, SlidersHorizontal, Radar, Download, Share2, ChevronLeft, ChevronRight, Eye, EyeOff, Zap, Star, Filter, Save, Trash2, ExternalLink, ArrowUpDown, Maximize2, Lightning } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

interface Stock {
  stock_code: string
  sector: string
  close: number
  change_percent: number
  value: number
  net_foreign_value: number
  whale_signal: boolean
  big_player_anomaly: boolean
  signal: string
  aov_ratio_ma20: number
  smart_score: number
}

const SIGNAL_STYLE: Record<string, string> = {
  Akumulasi:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20',
  Distribusi:  'bg-red-500/20 text-red-400 border border-red-500/20',
  Netral:      'bg-slate-500/20 text-slate-400 border border-slate-500/20',
  STRONG_BUY:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20',
  WATCH:       'bg-amber-500/20 text-amber-400 border border-amber-500/20',
  NEUTRAL:     'bg-slate-500/20 text-slate-400 border border-slate-500/20',
  AVOID:       'bg-red-500/20 text-red-400 border border-red-500/20',
}

const PRESETS = [
  { id: 'whale-hunt', name: '🐋 Whale Hunt', icon: Zap, filters: { flag: 'WHALE', minScore: 50 } },
  { id: 'foreign-flow', name: '🌏 Foreign Flow', icon: TrendingUp, filters: { flag: 'FOREIGN_BUY', signal: 'Akumulasi' } },
  { id: 'accumulation', name: '📈 Accumulation', icon: Star, filters: { signal: 'Akumulasi', minScore: 40 } },
  { id: 'stealth-mode', name: '🕵️ Stealth Mode', icon: Eye, filters: { flag: 'STEALTH', minScore: 35 } },
  { id: 'big-player', name: '⚡ Big Player', icon: Lightning, filters: { flag: 'BIG_PLAYER', minScore: 45 } },
]

function computeScore(r: any): number {
  let score = 0
  const sig = r.signal || ''
  if (sig === 'Akumulasi' || sig === 'STRONG_BUY') score += 50
  else if (sig === 'WATCH') score += 35
  else if (sig === 'Netral' || sig === 'NEUTRAL') score += 20
  if (r.whale_signal)        score += 20
  if (r.big_player_anomaly)  score += 15
  const aov = Number(r.aov_ratio_ma20) || 1
  if (aov >= 2)   score += 15
  else if (aov >= 1.5) score += 8
  if (Number(r.net_foreign_value) > 0) score += 10
  return Math.min(score, 100)
}

type SortField = 'smart_score'|'change_percent'|'value'|'net_foreign_value'|'aov_ratio_ma20'|'stock_code'
type ColumnKey = 'code'|'change'|'score'|'aov'|'foreign'|'flags'|'signal'|'sector'

interface FilterState {
  signal: string
  sector: string
  flag: string
  minScore: number
  search: string
}

const DEFAULT_COLUMNS: ColumnKey[] = ['code', 'change', 'score', 'aov', 'foreign', 'flags', 'signal']

export default function ScreenerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [results, setResults]   = useState<Stock[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [lastDate, setLastDate] = useState('')

  // Filter states
  const [search, setSearch]     = useState('')
  const [filterSignal, setFilterSignal] = useState('ALL')
  const [filterFlag, setFilterFlag]     = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [minScore, setMinScore] = useState(0)

  // Sort & pagination
  const [sortBy, setSortBy]     = useState<SortField>('smart_score')
  const [sortDir, setSortDir]   = useState<'desc'|'asc'>('desc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // UI states
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS)
  const [showPresets, setShowPresets] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Load filters from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get('s')) setSearch(params.get('s')!)
    if (params.get('sig')) setFilterSignal(params.get('sig')!)
    if (params.get('sec')) setFilterSector(params.get('sec')!)
    if (params.get('flag')) setFilterFlag(params.get('flag')!)
    if (params.get('score')) setMinScore(Number(params.get('score')))
    if (params.get('sort')) setSortBy(params.get('sort') as SortField)
    if (params.get('dir')) setSortDir(params.get('dir') as 'desc'|'asc')
  }, [searchParams])

  // Sync filters to URL
  const updateUrlParams = useCallback((filters: Partial<FilterState>) => {
    const params = new URLSearchParams(searchParams.toString())
    if (filters.search !== undefined) filters.search ? params.set('s', filters.search) : params.delete('s')
    if (filters.signal !== undefined) filters.signal !== 'ALL' ? params.set('sig', filters.signal) : params.delete('sig')
    if (filters.sector !== undefined) filters.sector !== 'ALL' ? params.set('sec', filters.sector) : params.delete('sec')
    if (filters.flag !== undefined) filters.flag !== 'ALL' ? params.set('flag', filters.flag) : params.delete('flag')
    if (filters.minScore !== undefined) filters.minScore > 0 ? params.set('score', String(filters.minScore)) : params.delete('score')
    params.set('sort', sortBy)
    params.set('dir', sortDir)
    router.push(`/screener?${params.toString()}`, { scroll: false })
  }, [searchParams, sortBy, sortDir, router])

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: dd } = await supabase
        .from('daily_transactions').select('trading_date')
        .order('trading_date', { ascending: false }).limit(1)
      const date = dd?.[0]?.trading_date
      if (!date) throw new Error('No trading data found')
      setLastDate(date)

      const { data, error: e } = await supabase
        .from('daily_transactions')
        .select('stock_code,sector,close,change_percent,value,net_foreign_value,whale_signal,big_player_anomaly,signal,aov_ratio_ma20')
        .eq('trading_date', date)
        .gt('value', 500_000_000)
        .limit(2000)
      if (e) throw e

      const scored: Stock[] = (data || []).map((r: any) => ({
        ...r,
        close: Number(r.close),
        change_percent: Number(r.change_percent),
        value: Number(r.value),
        net_foreign_value: Number(r.net_foreign_value),
        aov_ratio_ma20: Number(r.aov_ratio_ma20),
        smart_score: computeScore(r),
      }))
      setResults(scored)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const sectors = useMemo(() =>
    ['ALL', ...Array.from(new Set(results.map(r => r.sector).filter(Boolean))).sort()],
    [results]
  )

  const signals = useMemo(() =>
    ['ALL', ...Array.from(new Set(results.map(r => r.signal).filter(Boolean)))],
    [results]
  )

  // Apply filters
  const filtered = useMemo(() => results
    .filter(r => {
      if (search && !r.stock_code.includes(search.toUpperCase()) && !r.sector?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterSignal !== 'ALL' && r.signal !== filterSignal) return false
      if (filterSector !== 'ALL' && r.sector !== filterSector) return false
      if (filterFlag === 'WHALE' && !r.whale_signal) return false
      if (filterFlag === 'BIG_PLAYER' && !r.big_player_anomaly) return false
      if (filterFlag === 'FOREIGN_BUY' && r.net_foreign_value <= 0) return false
      if (filterFlag === 'STEALTH' && !(r.aov_ratio_ma20 >= 1.5)) return false
      if (r.smart_score < minScore) return false
      return true
    })
    .sort((a, b) => {
      const aVal = a[sortBy as keyof Stock]
      const bVal = b[sortBy as keyof Stock]
      const cmp = typeof aVal === 'string'
        ? aVal.localeCompare(bVal as string)
        : Number(aVal) - Number(bVal)
      return sortDir === 'desc' ? -cmp : cmp
    }), [results, search, filterSignal, filterSector, filterFlag, minScore, sortBy, sortDir])

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginatedData = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, filterSignal, filterSector, filterFlag, minScore])

  // Stats calculations
  const stats = useMemo(() => ({
    total: results.length,
    akumulasi: results.filter(r => r.signal === 'Akumulasi' || r.signal === 'STRONG_BUY').length,
    whale:     results.filter(r => r.whale_signal).length,
    foreign:   results.filter(r => r.net_foreign_value > 0).length,
    avg:       results.length ? Math.round(results.reduce((s, r) => s + r.smart_score, 0) / results.length) : 0,
  }), [results])

  const toggleSort = (col: SortField) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc'); updateUrlParams({}) }
  }

  const SortArrow = ({ col }: { col: SortField }) =>
    sortBy === col ? (sortDir === 'desc' ? <TrendingDown className="w-3 h-3 inline ml-1" /> : <TrendingUp className="w-3 h-3 inline ml-1" />) : null

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const f = preset.filters
    setFilterSignal(f.signal || 'ALL')
    setFilterFlag(f.flag || 'ALL')
    setMinScore(f.minScore || 0)
    setShowPresets(false)
    updateUrlParams({ signal: f.signal || 'ALL', flag: f.flag || 'ALL', minScore: f.minScore || 0 })
  }

  const resetFilters = () => {
    setSearch('')
    setFilterSignal('ALL')
    setFilterSector('ALL')
    setFilterFlag('ALL')
    setMinScore(0)
    router.push('/screener')
  }

  const exportToCSV = () => {
    const headers = ['Kode', 'Sektor', 'Harga', 'Chg%', 'Value', 'Foreign', 'AOV', 'Score', 'Signal']
    const rows = filtered.map(r => [
      r.stock_code, r.sector, r.close, `${r.change_percent.toFixed(2)}%`,
      formatNumber(r.value), formatRupiah(r.net_foreign_value), `${r.aov_ratio_ma20.toFixed(2)}x`,
      r.smart_score, r.signal
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `screener-${lastDate}-${filtered.length}stocks.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareLink = () => {
    const url = `${window.location.origin}/screener?${new URLSearchParams(searchParams.toString()).toString()}`
    navigator.clipboard.writeText(url)
    alert('Link filter disalin ke clipboard!')
  }

  const toggleColumn = (col: ColumnKey) => {
    setVisibleColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  return (
    <div className={`space-y-6 animate-fade-in pb-10 ${fullscreen ? 'fixed inset-4 z-50 bg-background/95 backdrop-blur-sm p-6 overflow-auto' : ''}`}>
      {/* Header dengan Action Buttons */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">
              <Radar className="w-8 h-8 text-gold-400 inline mr-2" />
              <span className="gradient-gold">Screener</span> <span className="text-foreground">Pro</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{filtered.length} / {results.length} emiten · Data {lastDate}</p>
          </div>
          {(filterSignal !== 'ALL' || filterFlag !== 'ALL' || minScore > 0 || search) && (
            <button onClick={resetFilters} className="text-xs text-gold-400 hover:text-gold-300 underline">
              Reset Filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets Dropdown */}
          <div className="relative">
            <button onClick={() => setShowPresets(p => !p)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gold-400/30 bg-gold-400/10 text-gold-400 text-xs font-bold hover:bg-gold-400/20 transition-all">
              <Zap className="w-4 h-4" /> Presets
            </button>
            {showPresets && (
              <div className="absolute right-0 top-full mt-2 glass rounded-xl border border-gold-400/20 shadow-2xl z-50 min-w-[200px] overflow-hidden animate-fade-in">
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
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${showFilters ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'glass border-border/30 text-muted-foreground hover:text-foreground'}`}>
            <SlidersHorizontal className="w-4 h-4" /> Filter
          </button>

          <button onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass border border-border/30 text-muted-foreground text-xs font-bold hover:text-foreground">
            <Download className="w-4 h-4" /> CSV
          </button>

          <button onClick={shareLink}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass border border-border/30 text-muted-foreground text-xs font-bold hover:text-foreground">
            <Share2 className="w-4 h-4" /> Share
          </button>

          <button onClick={() => setFullscreen(f => !f)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl glass border text-xs font-bold ${fullscreen ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'border-border/30 text-muted-foreground hover:text-foreground'}`}>
            {fullscreen ? <EyeOff className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button onClick={fetch} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-xs font-bold hover:bg-gold-400/20 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Scan
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Universe',   value: stats.total,     color: 'text-foreground',  icon: '📊' },
          { label: 'Akumulasi',  value: stats.akumulasi, color: 'text-emerald-400', icon: '📈' },
          { label: 'Whale',      value: stats.whale,     color: 'text-blue-400',    icon: '🐋' },
          { label: 'Foreign +',  value: stats.foreign,   color: 'text-cyan-400',    icon: '🌏' },
          { label: 'Avg Score',  value: stats.avg,       color: 'text-gold-400',    icon: '⭐' },
        ].map((m, i) => (
          <div key={i} className="glass rounded-xl p-4 border border-border/30 hover:border-gold-400/20 transition-all group">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
              <span className="text-lg">{m.icon}</span>
            </div>
            <p className={`text-2xl font-black mt-2 ${m.color} group-hover:scale-110 transition-transform`}>{m.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Quick Presets Bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {PRESETS.map(preset => (
          <button key={preset.id} onClick={() => applyPreset(preset)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl glass border border-white/[0.08] text-xs font-semibold hover:border-gold-400/30 hover:bg-gold-400/10 transition-all">
            <preset.icon className="w-4 h-4 text-gold-400" />
            {preset.name.split(' ')[1]}
          </button>
        ))}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="glass rounded-2xl p-5 border border-gold-400/20 space-y-4 animate-fade-in">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold text-gold-400 flex items-center gap-2">
              <Filter className="w-4 h-4" /> Advanced Filters
            </h3>
            <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
              Reset All
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Signal</label>
              <select value={filterSignal} onChange={e => { setFilterSignal(e.target.value); updateUrlParams({ signal: e.target.value }) }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                {signals.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Sektor</label>
              <select value={filterSector} onChange={e => { setFilterSector(e.target.value); updateUrlParams({ sector: e.target.value }) }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Flag Khusus</label>
              <select value={filterFlag} onChange={e => { setFilterFlag(e.target.value); updateUrlParams({ flag: e.target.value }) }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs focus:border-gold-400/30 focus:outline-none">
                <option value="ALL">Semua</option>
                <option value="WHALE">🐋 Whale Signal</option>
                <option value="BIG_PLAYER">⚡ Big Player</option>
                <option value="FOREIGN_BUY">🌏 Foreign Net Buy</option>
                <option value="STEALTH">🕵️ AOV Spike ≥1.5x</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">
                Min Score: <span className="text-gold-400 font-bold">{minScore}</span>
              </label>
              <input type="range" min={0} max={80} step={5} value={minScore}
                onChange={e => { setMinScore(Number(e.target.value)); updateUrlParams({ minScore: Number(e.target.value) }) }}
                className="w-full accent-amber-400 mt-2" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Page Size</label>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={200}>200 / page</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Columns</label>
              <button onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-left flex justify-between items-center">
                <span>{visibleColumns.length} visible</span>
                <ChevronLeft className={`w-3 h-3 transition-transform ${showColumnPicker ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Column Picker */}
          {showColumnPicker && (
            <div className="border-t border-white/[0.05] pt-4 mt-2">
              <div className="flex flex-wrap gap-2">
                {(['code', 'sector', 'change', 'score', 'aov', 'foreign', 'flags', 'signal'] as ColumnKey[]).map(col => (
                  <button key={col} onClick={() => toggleColumn(col)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${visibleColumns.includes(col)
                      ? 'bg-gold-400/20 border-gold-400/40 text-gold-400'
                      : 'bg-white/[0.03] border-white/[0.08] text-muted-foreground'}`}>
                    {col === 'code' ? 'Kode' : col === 'change' ? 'Change%' : col === 'score' ? 'Score' : col === 'aov' ? 'AOV' : col === 'foreign' ? 'Foreign' : col.charAt(0).toUpperCase() + col.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3 focus-within:border-gold-400/30 transition-all">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input type="text" placeholder="Cari kode saham atau sektor... (tekan Enter)" value={search}
          onChange={e => setSearch(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && updateUrlParams({ search })}
          className="flex-1 bg-transparent text-sm focus:outline-none" />
        {search && (
          <button onClick={() => { setSearch(''); updateUrlParams({ search: '' }) }} className="p-1 hover:bg-white/[0.05] rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <span className="text-xs text-muted-foreground px-2 py-1 bg-white/[0.05] rounded-lg">{filtered.length} hasil</span>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5" /><span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i) => <div key={i} className="shimmer h-12 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 border border-border/30 text-center">
          <Radar className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-2">Tidak ada hasil ditemukan</h3>
          <p className="text-muted-foreground text-sm mb-4">Coba ubah filter atau reset untuk melihat semua saham</p>
          <button onClick={resetFilters} className="px-6 py-2.5 bg-gold-400/20 border border-gold-400/30 text-gold-400 rounded-xl text-sm font-bold hover:bg-gold-400/30 transition-all">
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* Table Header Info */}
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-muted-foreground">
              Menampilkan <span className="text-gold-400 font-bold">{paginatedData.length}</span> dari <span className="text-foreground font-bold">{filtered.length}</span> saham
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <span className="text-xs font-bold text-gold-400">{sortBy.replace('_', ' ').toUpperCase()}</span>
              <span className="text-xs text-muted-foreground">({sortDir})</span>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-border/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase tracking-wider">
                    {visibleColumns.includes('code') && <th className="p-3 text-left w-8">#</th>}
                    {visibleColumns.includes('code') && <th className="p-3 text-left sticky left-0 bg-[#0B0F19]/95 backdrop-blur-sm z-10">Emiten</th>}
                    {visibleColumns.includes('sector') && <th className="p-3 text-left hidden md:table-cell">Sektor</th>}
                    {visibleColumns.includes('change') && (
                      <th className="p-3 text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('change_percent')}>
                        Chg% <SortArrow col="change_percent" />
                      </th>
                    )}
                    {visibleColumns.includes('score') && (
                      <th className="p-3 text-center cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('smart_score')}>
                        Score <SortArrow col="smart_score" />
                      </th>
                    )}
                    {visibleColumns.includes('aov') && (
                      <th className="p-3 text-center cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('aov_ratio_ma20')}>
                        AOV Ratio <SortArrow col="aov_ratio_ma20" />
                      </th>
                    )}
                    {visibleColumns.includes('foreign') && (
                      <th className="p-3 text-right hidden lg:table-cell cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('net_foreign_value')}>
                        Foreign <SortArrow col="net_foreign_value" />
                      </th>
                    )}
                    {visibleColumns.includes('flags') && <th className="p-3 text-center">Flags</th>}
                    {visibleColumns.includes('signal') && <th className="p-3 text-center">Signal</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((r, i) => (
                    <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02] group hover:bg-gold-400/[0.03] transition-all">
                      {visibleColumns.includes('code') && <td className="p-3 text-[11px] text-muted-foreground">{(page - 1) * pageSize + i + 1}</td>}
                      {visibleColumns.includes('code') && (
                        <td className="p-3 sticky left-0 bg-[#0B0F19] group-hover:bg-[#0B0F19]/95 backdrop-blur-sm z-10">
                          <Link href={`/stock/${r.stock_code}`} className="block group/link">
                            <p className="font-black font-mono text-base text-foreground group-hover/link:text-gold-400 transition-colors">{r.stock_code}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[130px] md:hidden">{r.sector || '—'}</p>
                          </Link>
                        </td>
                      )}
                      {visibleColumns.includes('sector') && (
                        <td className="p-3 hidden md:table-cell"><p className="text-xs text-muted-foreground">{r.sector || '—'}</p></td>
                      )}
                      {visibleColumns.includes('change') && (
                        <td className={`p-3 text-right font-bold ${r.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {r.change_percent >= 0 ? '▲' : '▼'} {Math.abs(r.change_percent).toFixed(2)}%
                        </td>
                      )}
                      {visibleColumns.includes('score') && (
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-lg font-black ${r.smart_score >= 60 ? 'text-emerald-400' : r.smart_score >= 40 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                              {r.smart_score}
                            </span>
                            <div className="w-12 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                              <div className={`h-full rounded-full ${r.smart_score >= 60 ? 'bg-emerald-400' : r.smart_score >= 40 ? 'bg-amber-400' : 'bg-slate-500'}`} style={{width:`${r.smart_score}%`}} />
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('aov') && (
                        <td className="p-3 text-center">
                          {(() => {
                            const aov = r.aov_ratio_ma20
                            const aovColor = aov >= 2 ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                             aov >= 1.5 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                             aov <= 0.6 && aov > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                             'bg-white/[0.04] text-muted-foreground border border-white/[0.06]'
                            return (
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold font-mono ${aovColor}`}>
                                {aov > 0 ? `${aov.toFixed(2)}x` : '—'}
                              </span>
                            )
                          })()}
                        </td>
                      )}
                      {visibleColumns.includes('foreign') && (
                        <td className={`p-3 text-right hidden lg:table-cell font-semibold ${r.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatRupiah(r.net_foreign_value)}
                        </td>
                      )}
                      {visibleColumns.includes('flags') && (
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1.5">
                            {r.whale_signal && <span title="Whale Signal" className="hover:scale-125 transition-transform">🐋</span>}
                            {r.big_player_anomaly && <span title="Big Player Anomaly" className="hover:scale-125 transition-transform">⚡</span>}
                            {r.net_foreign_value > 0 && <span title="Foreign Net Buy" className="hover:scale-125 transition-transform">🌏</span>}
                            {r.aov_ratio_ma20 >= 1.5 && <span title="AOV Spike" className="hover:scale-125 transition-transform">📊</span>}
                            {!r.whale_signal && !r.big_player_anomaly && r.net_foreign_value <= 0 && r.aov_ratio_ma20 < 1.5 && (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('signal') && (
                        <td className="p-3 text-center">
                          <Link href={`/stock/${r.stock_code}`}>
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${SIGNAL_STYLE[r.signal] || SIGNAL_STYLE.NEUTRAL} hover:scale-105 inline-block transition-transform`}>
                              {r.signal || 'Netral'}
                            </span>
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-white/[0.05] flex items-center justify-between">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:border-gold-400/30 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Page</span>
                  <span className="text-sm font-bold text-gold-400">{page}</span>
                  <span className="text-xs text-muted-foreground">of</span>
                  <span className="text-sm font-bold text-foreground">{totalPages}</span>
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-border/30 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:border-gold-400/30 transition-all">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="p-3 border-t border-white/[0.05] text-[10px] text-muted-foreground bg-white/[0.02]">
              💡 Score Formula: Signal(50) + Whale(20) + BigPlayer(15) + AOV(15) + Foreign(10) = Max 100
            </div>
          </div>
        </>
      )}
    </div>
  )
}
