'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatPercent, formatNumber } from '@/lib/utils'
import { Search, RefreshCw, TrendingUp, TrendingDown, X, AlertTriangle, SlidersHorizontal, Radar } from 'lucide-react'
import Link from 'next/link'

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

export default function ScreenerPage() {
  const [results, setResults]   = useState<Stock[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [filterSignal, setFilterSignal] = useState('ALL')
  const [filterFlag, setFilterFlag]     = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [minScore, setMinScore] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy]     = useState<'smart_score'|'change_percent'|'value'|'net_foreign_value'>('smart_score')
  const [sortDir, setSortDir]   = useState<'desc'|'asc'>('desc')
  const [lastDate, setLastDate] = useState('')

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

  const sectors = ['ALL', ...Array.from(new Set(results.map(r => r.sector).filter(Boolean))).sort()]

  const filtered = results
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
    .sort((a, b) => sortDir === 'desc' ? Number(b[sortBy]) - Number(a[sortBy]) : Number(a[sortBy]) - Number(b[sortBy]))

  const stats = {
    total: results.length,
    akumulasi: results.filter(r => r.signal === 'Akumulasi' || r.signal === 'STRONG_BUY').length,
    whale:     results.filter(r => r.whale_signal).length,
    foreign:   results.filter(r => r.net_foreign_value > 0).length,
    avg:       results.length ? Math.round(results.reduce((s, r) => s + r.smart_score, 0) / results.length) : 0,
  }

  const signals = ['ALL', ...Array.from(new Set(results.map(r => r.signal).filter(Boolean)))]

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }
  const SortArrow = ({ col }: { col: typeof sortBy }) =>
    sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            <Radar className="w-8 h-8 text-gold-400 inline mr-2" />
            <span className="gradient-gold">Screener</span> <span className="text-foreground">Pro</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{results.length} emiten · Data {lastDate}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${showFilters ? 'bg-gold-400/20 border-gold-400/40 text-gold-400' : 'glass border-border/30 text-muted-foreground'}`}>
            <SlidersHorizontal className="w-4 h-4" /> Filter
          </button>
          <button onClick={fetch} disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-400/10 border border-gold-400/30 text-gold-400 text-sm font-bold">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Scan
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Universe',   value: stats.total,     color: 'text-foreground'  },
          { label: 'Akumulasi',  value: stats.akumulasi, color: 'text-emerald-400' },
          { label: 'Whale 🐋',  value: stats.whale,     color: 'text-blue-400'    },
          { label: 'Foreign +',  value: stats.foreign,   color: 'text-cyan-400'    },
          { label: 'Avg Score',  value: stats.avg,       color: 'text-gold-400'    },
        ].map((m, i) => (
          <div key={i} className="glass rounded-xl p-4 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
            <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="glass rounded-2xl p-5 border border-gold-400/20 space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Signal</label>
              <select value={filterSignal} onChange={e => setFilterSignal(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
                {signals.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">Sektor</label>
              <select value={filterSector} onChange={e => setFilterSector(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase mb-2 block">
                Flag Khusus
              </label>
              <select value={filterFlag} onChange={e => setFilterFlag(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
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
                onChange={e => setMinScore(Number(e.target.value))}
                className="w-full accent-amber-400 mt-2" />
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="glass rounded-xl p-3 border border-border/30 flex items-center gap-3">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input type="text" placeholder="Filter kode atau sektor..." value={search}
          onChange={e => setSearch(e.target.value.toUpperCase())}
          className="flex-1 bg-transparent text-sm focus:outline-none" />
        {search && <button onClick={() => setSearch('')}><X className="w-4 h-4 text-muted-foreground" /></button>}
        <span className="text-xs text-muted-foreground">{filtered.length} hasil</span>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertTriangle className="w-5 h-5" /><span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i) => <div key={i} className="shimmer h-12 rounded-xl" />)}</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-border/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/[0.05] text-[10px] text-muted-foreground uppercase">
                  <th className="p-3 text-left w-8">#</th>
                  <th className="p-3 text-left">Emiten</th>
                  <th className="p-3 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('change_percent')}>Chg%{SortArrow({col:'change_percent'})}</th>
                  <th className="p-3 text-center cursor-pointer hover:text-foreground" onClick={() => toggleSort('smart_score')}>Score{SortArrow({col:'smart_score'})}</th>
                  <th className="p-3 text-right hidden lg:table-cell cursor-pointer hover:text-foreground" onClick={() => toggleSort('net_foreign_value')}>Foreign{SortArrow({col:'net_foreign_value'})}</th>
                  <th className="p-3 text-center">Flags</th>
                  <th className="p-3 text-center">Signal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.stock_code} className="tr-hover border-b border-white/[0.02]">
                    <td className="p-3 text-[11px] text-muted-foreground">{i+1}</td>
                    <td className="p-3">
                      <Link href={`/stock/${r.stock_code}`} className="block group">
                        <p className="font-black font-mono text-base text-foreground group-hover:text-gold-400 transition-colors">{r.stock_code}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[130px]">{r.sector || '—'}</p>
                      </Link>
                    </td>
                    <td className={`p-3 text-right font-bold ${r.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.change_percent >= 0 ? '▲' : '▼'} {Math.abs(r.change_percent).toFixed(2)}%
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-lg font-black ${r.smart_score >= 60 ? 'text-emerald-400' : r.smart_score >= 40 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                          {r.smart_score}
                        </span>
                        <div className="w-12 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                          <div className={`h-full rounded-full ${r.smart_score >= 60 ? 'bg-emerald-400' : r.smart_score >= 40 ? 'bg-amber-400' : 'bg-slate-500'}`}
                            style={{width:`${r.smart_score}%`}} />
                        </div>
                      </div>
                    </td>
                    <td className={`p-3 text-right hidden lg:table-cell font-semibold ${r.net_foreign_value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatRupiah(r.net_foreign_value)}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        {r.whale_signal      && <span title="Whale">🐋</span>}
                        {r.big_player_anomaly && <span title="Big Player">⚡</span>}
                        {r.net_foreign_value > 0 && <span title="Foreign Buy">🌏</span>}
                        {r.aov_ratio_ma20 >= 1.5 && <span title="AOV Spike">📊</span>}
                        {!r.whale_signal && !r.big_player_anomaly && r.net_foreign_value <= 0 && r.aov_ratio_ma20 < 1.5 && <span className="text-muted-foreground/30 text-[10px]">—</span>}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <Link href={`/stock/${r.stock_code}`}>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${SIGNAL_STYLE[r.signal] || SIGNAL_STYLE.NEUTRAL}`}>
                          {r.signal || 'Netral'}
                        </span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-white/[0.05] text-xs text-muted-foreground">
            {filtered.length} dari {results.length} emiten · Score = Signal(50) + Whale(20) + BigPlayer(15) + AOV(15) + Foreign(10)
          </div>
        </div>
      )}
    </div>
  )
}
